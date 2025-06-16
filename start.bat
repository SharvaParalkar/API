@echo off

start wt ^
    new-tab -d "C:\Users\Admin\Downloads\API\dashboard" cmd /k "node dashboard.js" ^
    ; new-tab -d "C:\Users\Admin\Downloads\API\DB" cmd /k "node server.js" ^
    ; new-tab -d "C:\Users\Admin\Downloads\API\Order-Form" cmd /k "node server.js" ^
    ; new-tab -d "C:\Users\Admin\Downloads\API\STL-UPLOADER" cmd /k "node server.js" ^
    ; new-tab -d "C:\Users\Admin\Downloads\API\Filament" cmd /k "node server.js" ^
    ; new-tab -d "C:\Users\Admin" cmd /k "cloudflared tunnel run stl-api"
