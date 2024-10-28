# Web2 to Web3 (WTTP) Gateway

WTTP Gateway redirects WTTP requests through an embedded RPC in the browser. Query contract addresses after wttp.
The server must be configured to send all requests back to index.html like a single page app.

## To run

`yarn` or `npm install`
`yarn run start`

## Deploy

Build to dist: `yarn run build`

Deploy your dist to static hosting and set your routes to point back to index.html just like in a react app or SPA.

To serve a single domain route a domain to a single contract address.

### Examples

http://localhost:5000/wttp/0x9C29F0eE3D59dFea70D616f4776F7649dA364342
http://localhost:5000/wttp/0x61ba60374e0CF9a51aD846853b08B09FC163896a
http://localhost:5000/wttp/0xaD7A50341F4Cc6C792fAc35D3e6A67eA1750EDBc

### Please visit the TW3 browser for full browsing:

[TW3 Browser](https://github.com/TechnicallyWeb3/min-web3)

## TODO

- Add support of other TLDs
- Move resource fetching into service workers
- Ban local cookies and non-secure javascript
