# FilamentBros API

This repository contains the API and dashboard for FilamentBros 3D printing service.


## Features

- Order management dashboard
- Real-time status updates (10-second polling)
- File upload and management
- Price estimation
- Order tracking

## Security

- Session-based authentication
- Rate limiting
- CORS protection
- Secure cookie handling

## License

ISC

# API
API for filamentbros, the api allows users to access the database (order tracker) located on a Server PC, acess to the print estimate feature of the print request form, and allows for print requests to be sent to the server

PC -> Order Tracker
PC <- Request form
PC <-> Database
PC -> Dashboard
PC <-> Print Estimate Feature

WHAT EACH FILE DOES:
db/server.js - allows for order lookups
order-form/server.js - sends order submissions to the database and organizes STL files with proper order ID
STL-UPLOADER/server.js - Used for generating print estimates as a feature on the order form

FEATURE LOG

05/16/2025 - Got the upload stl feature working. Current state allows a user to access api.filamentbros.com/stl, upload an stl which is viewable in the stl-uploader/uploads file. 

05/17/2025 - got the prusa cli connected, files are uploaded, processed, and then sent back to the browser. added multiple files (up to five, 100mb each). Real time updates for when files are finished processing. 

05/18/2025 - got database set up, connected it to api.filamentbros.com/status/lookup/(email or phone), sanitizes phone #, database schema set up, imported old orders. 

05/19/2025 - order tracker working again (refresh bug still there), order submission html set up

05/20/2025 - order form now submits correctly to the database as a new entry, uploaded stl files also get named with the same order ID (i think)

05/21/2025 - stl viewer for the order form

05/22/2025 - stl viewer for the order form fixes

05/23/2025 - n/a

05/24/2025 - n/a

05/25/2025 - dashboard work, initial prototype complete, no download functionality yet, just shows all orders in nice cards. 

05/26/2025 - Dashboard, shows all cards, collapses cards, download functionality works, and styling is better


npm install socket.io express-socket.io-session


sqlite3 DB/db/filamentbros.sqlite "ALTER TABLE orders ADD COLUMN updated_by TEXT;"

sqlite3 DB/db/filamentbros.sqlite "ALTER TABLE orders ADD COLUMN last_updated DATETIME;"

fetch('/dashboard/clear-subscriptions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include'
})
.then(response => response.json())
.then(data => console.log('Cleared subscriptions:', data))
.catch(error => console.error('Error:', error));

clear subscriptions ^

