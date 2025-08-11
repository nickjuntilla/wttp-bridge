const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  mode: "development", // or 'production' for production builds
  entry: {
    index: "./src/index.js", // Entry point for popup.js
  },
  output: {
    filename: "[name].js", // Output bundle files
    path: path.resolve(__dirname, "dist"), // Output directory is 'dist'
    publicPath: "/", // Serve files from the root directory
  },
  resolve: {
    fallback: {
      fs: false,
      path: require.resolve("path-browserify"),
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
      buffer: require.resolve("buffer"),
      util: require.resolve("util"),
      os: require.resolve("os-browserify/browser"),
      url: require.resolve("url"),
      zlib: require.resolve("browserify-zlib"),
      http: require.resolve("stream-http"),
      https: require.resolve("https-browserify"),
      assert: require.resolve("assert"),
      querystring: require.resolve("querystring-es3"),
    },
  },
  plugins: [
    new Dotenv(), // Load environment variables from .env file
    new HtmlWebpackPlugin({
      template: "./src/public/index.html", // Use a template HTML file
    }),
  ],
  devServer: {
    port: 8080, // Specify the port
    open: true, // Open the browser on start
    hot: true, // Enable Hot Module Replacement
    historyApiFallback: true, // Support client-side routing (e.g., React Router)
    // Fully permissive headers for WTTP gateway - all sources trusted
    headers: {
      "Content-Security-Policy":
        "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * 'unsafe-inline'; script-src * 'unsafe-inline' 'unsafe-eval' data: blob:; style-src * 'unsafe-inline' data:; img-src * data: blob:; font-src * data:; media-src * data: blob:; object-src *; frame-src *; worker-src * blob: data:; child-src * blob: data:;",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "*",
      "Access-Control-Allow-Headers": "*",
    },
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader", // Optionally use Babel to transpile JS
          options: {
            presets: ["@babel/preset-env"],
          },
        },
      },
    ],
  },
};
