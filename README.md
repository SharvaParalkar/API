# API
API for filamentbros, the api allows users to access the database (order tracker) located on a Server PC, acess to the print estimate feature of the print request form, and allows for print requests to be sent to the server

PC -> Order Tracker
PC <- Request form
PC <-> Database
PC -> Dashboard
PC <-> Print Estimate Feature

FEATURE LOG 
05/16/2025 - Got the upload stl feature working. Current state allows a user to access api.filamentbros.com/stl, upload an stl which is viewable in the stl-uploader/uploads file. 

05/17/2025 - got the prusa cli connected, files are uploaded, processed, and then sent back to the browser. added multiple files (up to five, 100mb each). Real time updates for when files are finished processing. 

05/18/2025 - got database set up, connected it to api.filamentbros.com/status/lookup/(email or phone), sanitizes phone #, database schema set up, imported old orders. 