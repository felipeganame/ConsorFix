export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class InvalidTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('INVALID_TRANSITION', `Invalid ticket transition: ${from} -> ${to}`, { from, to });
  }
}
