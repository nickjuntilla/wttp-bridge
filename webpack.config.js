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
