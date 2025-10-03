# Web2 to Web3 (WTTP) Bridge

WTTP Bridge redirects WTTP requests through an embedded RPC in the browser. Query contract addresses after wttp.
The server must be configured to send all requests back to index.html like a single page app.

## To run

`yarn` or `npm install`

`yarn run start`

## Deploy

Build to dist: `yarn run build`

Deploy your dist to static hosting and set your routes to point back to index.html just like in a react app or SPA.

To serve a single domain route a domain to a single contract address.

### Examples

- http://localhost:5000/wttp/0xdDFAfc6013C9c17f421Ef0054691D62e0A28688C
- http://localhost:5000/wttp/0xD8B79a32dCb6a2a5370069e97aE46cEb4a49D331

## To serve a single web2 domain

Step 1: set SINGLE_CONTRACT in .env to your contract

Step 2: deploy the WTTP-Bridge way to a static host

Step 3: set your DNS to point your static host

## Please visit the TW3 browser for full browsing:

[TW3 Browser](https://github.com/TechnicallyWeb3/min-web3)

## TODO

- Add support of other TLDs
- Move resource fetching into service workers
- Ban local cookies and non-secure javascript
