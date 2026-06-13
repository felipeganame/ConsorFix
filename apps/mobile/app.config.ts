import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'ConsorcioFix',
  slug: 'consorciofix',
  version: '0.0.0',
  orientation: 'portrait',
  scheme: 'consorciofix',
  platforms: ['ios', 'android'],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000',
  },
};

export default config;
