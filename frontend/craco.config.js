const path = require('path');

module.exports = {
  eslint: {
    enable: true,
    mode: 'extends',
    configure: {
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'warn',
      },
    },
  },
  webpack: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    configure: (webpackConfig) => {
      webpackConfig.watchOptions = {
        ignored: /node_modules|\.git|build|dist|coverage|public/,
      };
      return webpackConfig;
    },
  },
};
