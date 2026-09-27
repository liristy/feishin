import { app } from 'electron';
import { join } from 'path';

// Keep existing settings and caches after the display name changes to qMusic.
// Respect an explicit user-data directory supplied by the launcher.
if (app.getPath('userData') === join(app.getPath('appData'), app.getName())) {
    app.setPath('userData', join(app.getPath('appData'), 'feishin'));
}
