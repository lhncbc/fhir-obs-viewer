const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const packageJson = require('./package.json');


module.exports = {
  entry: ['promise-polyfill/src/polyfill', './source/js/app.js'],
  optimization: {
    minimizer: [new TerserJSPlugin({sourceMap: true}), new OptimizeCSSAssetsPlugin({})],
  },
  output: {
    filename: 'app.[contenthash].js',
    path: path.resolve(__dirname, 'public'),
    library: 'app',
    libraryTarget: 'umd'
  },
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html', // under output.path
      // templateParameters are used by default fallback js loader (see
      // https://github.com/jantimon/html-webpack-plugin/blob/master/docs/template-option.md):
      templateParameters: {
        version: packageJson.version
      },
      template: 'source/index.ejs'
    }),
    new webpack.IgnorePlugin(/^\.\/locale$/, /moment$/),
    new MiniCssExtractPlugin({
      filename: 'app.[contenthash].css',
    })
  ],
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|gif)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[name].[contenthash].[ext]'
            }
          }
        ]
      },
      {
        test: /\.m?js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [['@babel/preset-env',
              {
                "targets": {
                  "browsers": "ie >= 10"
                }
              }
            ]]
          }
        }
      },
      {
        test: /definitions\/index.json$/,
        use: [
          {
            loader: path.resolve('source/js/search-parameters/definitions/webpack-loader.js'),
            options: require(path.resolve('source/js/search-parameters/definitions/webpack-options.json'))
          }
        ]
      }
    ]
  }
}
