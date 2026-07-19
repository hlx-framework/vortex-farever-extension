const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  target: 'node',
  entry: './src/index.ts',
  module: {
    rules: [{ test: /\.ts$/, loader: 'ts-loader', exclude: /node_modules/ }],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  externals: {
    'vortex-api': 'commonjs2 vortex-api',
  },
  output: {
    libraryTarget: 'commonjs2',
    path: path.resolve(__dirname, 'build'),
    filename: 'index.js',
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'src/info.json', to: 'info.json' },
        { from: 'src/assets', to: '.' },
      ],
    }),
  ],
};
