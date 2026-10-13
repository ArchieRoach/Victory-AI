const path = require('path');

module.exports = {
  eslint: {
    enable: true,
    mode: 'extends',
    configure: {
      plugins: ['react-hooks'],
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'off',
      },
    },
  },
  jest: {
    configure: {
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^expo-glass-effect$': '<rootDir>/src/lib/glass/expo-glass-effect.js',
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Web build of Expo's GlassView API (see the file for why the native package isn't used).
      'expo-glass-effect': path.resolve(__dirname, 'src/lib/glass/expo-glass-effect.js'),
    },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ignored: /node_modules|\.git|build|dist|coverage|public/,
      };
      return webpackConfig;
    },
  },
};
