from __future__ import absolute_import

import watchdog
import watchdog.events

class CallbackFileSystemWatch(watchdog.events.FileSystemEventHandler):

    def __init__(self, callback):
        watchdog.events.FileSystemEventHandler.__init__(self)
        self.callback = callback

    def on_any_event(self, event):
        self.callback(event)
