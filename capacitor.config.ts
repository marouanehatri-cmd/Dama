import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.damamaster.app',
  appName: 'Dama Master',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
