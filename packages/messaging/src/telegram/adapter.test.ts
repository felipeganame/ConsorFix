import { describe, expect, it } from 'vitest';
import { TelegramProvider } from './adapter.js';

const TOKEN = '123456:TEST';
const SECRET = 'secreto-de-prueba';

function provider(secret = SECRET): TelegramProvider {
  return new TelegramProvider(TOKEN, secret);
}

function update(message: Record<string, unknown>): unknown {
  return { update_id: 1, message: { message_id: 7, date: 1700000000, chat: { id: 42 }, ...message } };
}

describe('TelegramProvider — autenticidad del webhook', () => {
  it('acepta el secreto correcto', () => {
    expect(provider().verifySignature('{}', SECRET)).toBe(true);
  });

  it('rechaza un secreto distinto', () => {
    expect(provider().verifySignature('{}', 'otro-secreto-xx')).toBe(false);
  });

  it('rechaza cuando no viene el header', () => {
    expect(provider().verifySignature('{}', undefined)).toBe(false);
  });

  it('es fail-closed: sin secreto configurado rechaza todo', () => {
    // El webhook de WhatsApp tenía justamente el bug opuesto: con el secreto
    // vacío se salteaba la verificación y aceptaba cualquier payload.
    expect(provider('').verifySignature('{}', 'lo-que-sea')).toBe(false);
    expect(provider('').verifySignature('{}', '')).toBe(false);
  });

  it('no se cae con un header de largo distinto', () => {
    // timingSafeEqual tira si los buffers difieren en largo: hay que chequear
    // antes, y esa guarda es fácil de perder en un refactor.
    expect(() => provider().verifySignature('{}', 'x')).not.toThrow();
    expect(provider().verifySignature('{}', 'x')).toBe(false);
  });
});

describe('TelegramProvider — parseo de updates', () => {
  it('lee un mensaje de texto', () => {
    const [m] = provider().parseWebhook(update({ text: 'se rompió un caño' }));
    expect(m?.kind).toBe('text');
    expect(m?.text).toBe('se rompió un caño');
    expect(m?.channel).toBe('telegram');
    expect(m?.externalId).toBe('42');
  });

  it('compone el id del mensaje con el chat', () => {
    // message_id es único por chat, no globalmente. Sin componerlo, dos chats
    // distintos colisionarían en la constraint de idempotencia.
    const [m] = provider().parseWebhook(update({ text: 'hola' }));
    expect(m?.wamid).toBe('tg:42:7');
  });

  it('normaliza a E.164 el teléfono compartido', () => {
    // Telegram manda el número sin '+' en muchos clientes.
    const [m] = provider().parseWebhook(update({ contact: { phone_number: '5491100000002' } }));
    expect(m?.contactPhone).toBe('+5491100000002');
  });

  it('respeta el + cuando ya viene', () => {
    const [m] = provider().parseWebhook(update({ contact: { phone_number: '+54 911 0000 0002' } }));
    expect(m?.contactPhone).toBe('+5491100000002');
  });

  it('toma la foto de mayor resolución', () => {
    // Telegram manda varias miniaturas; la última es la grande, que es la que
    // le sirve al modelo de visión.
    const [m] = provider().parseWebhook(
      update({
        photo: [
          { file_id: 'chica', file_size: 100 },
          { file_id: 'mediana', file_size: 500 },
          { file_id: 'grande', file_size: 9000 },
        ],
        caption: 'mirá el caño',
      }),
    );
    expect(m?.kind).toBe('image');
    expect(m?.mediaId).toBe('grande');
    expect(m?.text).toBe('mirá el caño');
  });

  it('reconoce audios de voz', () => {
    const [m] = provider().parseWebhook(update({ voice: { file_id: 'voz-1' } }));
    expect(m?.kind).toBe('audio');
    expect(m?.mediaId).toBe('voz-1');
  });

  it('marca como "other" lo que no sabe manejar', () => {
    const [m] = provider().parseWebhook(update({ document: { file_id: 'doc', mime_type: 'application/pdf' } }));
    expect(m?.kind).toBe('other');
  });

  it('ignora updates que no son mensajes', () => {
    expect(provider().parseWebhook({ update_id: 1 })).toEqual([]);
    expect(provider().parseWebhook({})).toEqual([]);
    expect(provider().parseWebhook(null)).toEqual([]);
  });

  it('ignora un mensaje sin chat identificable', () => {
    expect(provider().parseWebhook({ message: { text: 'hola' } })).toEqual([]);
  });
});

describe('TelegramProvider — construcción', () => {
  it('exige el token del bot', () => {
    expect(() => new TelegramProvider('', SECRET)).toThrow(/TELEGRAM_BOT_TOKEN/);
  });
});
