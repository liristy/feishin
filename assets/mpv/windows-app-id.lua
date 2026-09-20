-- The bundled Windows mpv uses LuaJIT. Share the real Feishin shortcut's identity
-- so SMTC can resolve its name and icon without a second Start menu entry.
local ffi = require('ffi')
ffi.cdef[[long SetCurrentProcessExplicitAppUserModelID(const uint16_t *AppID);]]

local id = 'org.jeffvli.feishin'
local wide = ffi.new('uint16_t[?]', #id + 1)
for i = 1, #id do wide[i - 1] = id:byte(i) end

local result = ffi.load('shell32').SetCurrentProcessExplicitAppUserModelID(wide)
if result ~= 0 then
    mp.msg.error('Failed to set Feishin media identity: ' .. tonumber(result))
end
