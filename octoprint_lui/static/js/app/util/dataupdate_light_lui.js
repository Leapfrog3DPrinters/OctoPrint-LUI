function DataUpdater(allViewModels) {
    var self = this;

    self.allViewModels = allViewModels;

    self._pluginHash = undefined;
    self._configHash = undefined;

    self.connect = function() {
        OctoPrint.socket.connect({debug: !!SOCKJS_DEBUG});
    };

    self.reconnect = function() {
        OctoPrint.socket.reconnect();
    };

    self._onReconnectAttempt = function(trial) {
        if (trial <= 0) {
            // Only consider it a real disconnect if the trial number has exceeded our threshold.
            return;
        }

        var handled = false;
        callViewModelsIf(
            self.allViewModels,
            "onServerDisconnect",
            function() { return !handled; },
            function(method) { handled = !method() || handled; }
        );

        if (handled) {
            return true;
        }

    };

    self._onReconnectFailed = function() {
        var handled = false;
        callViewModelsIf(
            self.allViewModels,
            "onServerDisconnect",
            function() { return !handled; },
            function(method) { handled = !method() || handled; }
        );

        if (handled) {
            return;
        }
    };

    self._onConnected = function(event) {
        var data = event.data;

        // update version information
        var oldVersion = VERSION;
        VERSION = data["version"];
        DISPLAY_VERSION = data["display_version"];
        BRANCH = data["branch"];
        $("span.version").text(DISPLAY_VERSION);

        // update plugin hash
        var oldPluginHash = self._pluginHash;
        self._pluginHash = data["plugin_hash"];

        // update config hash
        var oldConfigHash = self._configHash;
        self._configHash = data["config_hash"];

        // if the version, the plugin hash or the config hash changed, we
        // want the user to reload the UI since it might be stale now
        var versionChanged = oldVersion != VERSION;
        var pluginsChanged = oldPluginHash != undefined && oldPluginHash != self._pluginHash;
        var configChanged = oldConfigHash != undefined && oldConfigHash != self._configHash;
        if (versionChanged || pluginsChanged || configChanged) {
            self.reloadOverlay.show();
        }
    };

    self._onHistoryData = function(event) {
        callViewModels(self.allViewModels, "fromHistoryData", [event.data]);
    };

    self._onCurrentData = function(event) {
        callViewModels(self.allViewModels, "fromCurrentData", [event.data]);
    };

    self._onSlicingProgress = function(event) {
        callViewModels(self.allViewModels, "onSlicingProgress", [
            data["slicer"],
            data["model_path"],
            data["machinecode_path"],
            data["progress"]
        ]);
    };

    self._onEvent = function(event) {
        var gcodeUploadProgress = $("#gcode_upload_progress");
        var gcodeUploadProgressBar = $(".bar", gcodeUploadProgress);

        var type = event.data["type"];
        var payload = event.data["payload"];
        var html = "";
        var format = {};

        log.debug("Got event " + type + " with payload: " + JSON.stringify(payload));

        if (type == "SettingsUpdated") {
            if (payload && payload.hasOwnProperty("config_hash")) {
                self._configHash = payload.config_hash;
            }
        } else if (type == "MovieRendering") {
        } else if (type == "MovieDone") {
        } else if (type == "MovieFailed") {
        } else if (type == "PostRollStart") {
        } else if (type == "SlicingStarted") {
            gcodeUploadProgress.addClass("progress-striped").addClass("active");
            gcodeUploadProgressBar.css("width", "100%");
            if (payload.progressAvailable) {
                gcodeUploadProgressBar.text(_.sprintf(gettext("Slicing ... (%(percentage)d%%)"), {percentage: 0}));
            } else {
                gcodeUploadProgressBar.text(gettext("Slicing ..."));
            }
        } else if (type == "SlicingDone") {
            gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
            gcodeUploadProgressBar.css("width", "0%");
            gcodeUploadProgressBar.text("");
        } else if (type == "SlicingCancelled") {
            gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
            gcodeUploadProgressBar.css("width", "0%");
            gcodeUploadProgressBar.text("");
        } else if (type == "SlicingFailed") {
            gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
            gcodeUploadProgressBar.css("width", "0%");
            gcodeUploadProgressBar.text("");

            html = _.sprintf(gettext("Could not slice %(stl)s to %(gcode)s: %(reason)s"), payload);
        } else if (type == "TransferStarted") {
            gcodeUploadProgress.addClass("progress-striped").addClass("active");
            gcodeUploadProgressBar.css("width", "100%");
            gcodeUploadProgressBar.text(gettext("Streaming ..."));
        } else if (type == "TransferDone") {
            gcodeUploadProgress.removeClass("progress-striped").removeClass("active");
            gcodeUploadProgressBar.css("width", "0%");
            gcodeUploadProgressBar.text("");
            gcodeFilesViewModel.requestData(payload.remote, "sdcard");
        }

        var legacyEventHandlers = {
            "UpdatedFiles": "onUpdatedFiles",
            "MetadataStatisticsUpdated": "onMetadataStatisticsUpdated",
            "MetadataAnalysisFinished": "onMetadataAnalysisFinished",
            "SlicingDone": "onSlicingDone",
            "SlicingCancelled": "onSlicingCancelled",
            "SlicingFailed": "onSlicingFailed"
        };
        _.each(self.allViewModels, function(viewModel) {
            if (viewModel.hasOwnProperty("onEvent" + type)) {
                viewModel["onEvent" + type](payload);
            } else if (legacyEventHandlers.hasOwnProperty(type) && viewModel.hasOwnProperty(legacyEventHandlers[type])) {
                // there might still be code that uses the old callbacks, make sure those still get called
                // but log a warning
                log.warn("View model " + viewModel.name + " is using legacy event handler " + legacyEventHandlers[type] + ", new handler is called " + legacyEventHandlers[type]);
                viewModel[legacyEventHandlers[type]](payload);
            }
        });
    };

    self._onTimelapse = function(event) {
        callViewModels(self.allViewModels, "fromTimelapseData", [event.data]);
    };

    self._onPluginMessage = function(event) {
        callViewModels(self.allViewModels, "onDataUpdaterPluginMessage", [event.data.plugin, event.data.data]);
    };

    OctoPrint.socket.onReconnectAttempt = self._onReconnectAttempt;
    OctoPrint.socket.onReconnectFailed = self._onReconnectFailed;
    OctoPrint.socket
        .onMessage("connected", self._onConnected)
        .onMessage("history", self._onHistoryData)
        .onMessage("current", self._onCurrentData)
        .onMessage("slicingProgress", self._onSlicingProgress)
        .onMessage("event", self._onEvent)
        .onMessage("timelapse", self._onTimelapse)
        .onMessage("plugin", self._onPluginMessage);

    self.connect();
}
