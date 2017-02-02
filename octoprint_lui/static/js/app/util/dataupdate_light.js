function DataUpdater(allViewModels) {
    var self = this;

    self.allViewModels = allViewModels;

    self._pluginHash = undefined;
    self._configHash = undefined;

    self._connectedDeferred = undefined;

    self._throttleFactor = 1;
    self._baseProcessingLimit = 500.0;
    self._lastProcessingTimes = [];
    self._lastProcessingTimesSize = 20;

    self.increaseThrottle = function () {
        self.setThrottle(self._throttleFactor + 1);
    };

    self.decreaseThrottle = function () {
        if (self._throttleFactor <= 1) {
            return;
        }
        self.setThrottle(self._throttleFactor - 1);
    };

    self.setThrottle = function(throttle) {
        self._throttleFactor = throttle;

        self._send("throttle", self._throttleFactor);
        log.debug("DataUpdater: New SockJS throttle factor:", self._throttleFactor, " new processing limit:", self._baseProcessingLimit * self._throttleFactor);
    };

    self._send = function(message, data) {
        var payload = {};
        payload[message] = data;
        self._socket.send(JSON.stringify(payload));
    };

    self.connect = function () {
        if (self._connectedDeferred) {
            self._connectedDeferred.reject();
        }
        self._connectedDeferred = $.Deferred();
        OctoPrint.socket.connect({debug: !!SOCKJS_DEBUG});
        return self._connectedDeferred.promise();
    };

    self.reconnect = function () {
        if (self._connectedDeferred) {
            self._connectedDeferred.reject();
        }
        self._connectedDeferred = $.Deferred();
        OctoPrint.socket.reconnect();
        return self._connectedDeferred.promise();
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
            function () { return !handled; },
            function(method) { var result = method(); handled = (result !== undefined && !result) || handled; }
        );

        if (handled) {
            return true;
        }

        var title = "";
        var message = "";

        if (IS_LOCAL) {
            title = gettext("Service restarting");
            message = gettext("The background service of the printer is restarting. This is common after a software update. Printer will be available in a couple of minutes.")
        } else {
            title = gettext("Server disconnected");
            message = gettext("The browser has been disconnected from the printer. Either the printer is turned off or the network connection failed. Trying to reconnect in the coming minutes.")
        }

        showOfflineFlyout(
            title,
            message,
            self.reconnect
        );

    };

    self._onReconnectFailed = function () {
        var handled = false;
        callViewModelsIf(
            self.allViewModels,
            "onServerDisconnect",
            function () { return !handled; },
            function(method) { var result = method(); handled = (result !== undefined && !result) || handled; }
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
            // self.reloadOverlay.show(); Commented for now maybe we want to use this in LUI
        }

        if ($('#offline_flyout').hasClass('active')) {
            // Lets just try to reload straight away when we reconnect after an offline period.
            return location.reload(true);
        } else {
            callViewModels(self.allViewModels, "onServerConnect");
        }

        log.info("Connected to the server");

        // if we have a connected promise, resolve it now
        if (self._connectedDeferred) {
            self._connectedDeferred.resolve();
            self._connectedDeferred = undefined;
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

        if (!deferEventNotifications) {
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
                    gcodeUploadProgressBar.text(_.sprintf(gettext("Slicing ... (%(percentage)d%%)"), { percentage: 0 }));
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
            } else if (type == "PrintStarted") {
                $.notify({
                    title: gettext("Print job started"),
                    text: _.sprintf(gettext(' Printing file: "%(filename)s"'), { filename: payload.filename })
                },
                    "success"
                )
            } else if (type == "PrintPaused") {
                $.notify({
                    title: gettext("Print job paused"),
                    text: _.sprintf(gettext('Pausing file: "%(filename)s"'), { filename: payload.filename })
                },
                    "warning"
                )
            } else if (type == "PrintCancelled") {
                $.notify({
                    title: gettext("Print job canceled"),
                    text: _.sprintf(gettext('Canceled file: "%(filename)s"'), { filename: payload.filename })
                },
                    "error"
                )
            } else if (type == "PrintDone") {
                $.notify({
                    title: gettext("Print job finished"),
                    text: _.sprintf(gettext(' Finished file: "%(filename)s"'), { filename: payload.filename })
                },
                    { 
                        className: "success",
                        autoHide: false
                    }
                )
            } else if (type == "PrintResumed") {
                $.notify({
                    title: gettext("Print job resumed"),
                    text: _.sprintf(gettext(' Resuming file: "%(filename)s"'), { filename: payload.filename })
                },
                    "success"
                )
            } else if (type == "FileSelected") {
                $.notify({
                    title: gettext("File selected succesfully"),
                    text: _.sprintf(gettext('Selected file: "%(filename)s"'), { filename: payload.filename })
                },
                    "success"
                )
            }
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

    self._onIncreaseRate = function(measurement, minimum) {
        log.debug("We are fast (" + measurement + " < " + minimum + "), increasing refresh rate");
        OctoPrint.socket.increaseRate();
    };

    self._onDecreaseRate = function(measurement, maximum) {
        log.debug("We are slow (" + measurement + " > " + maximum + "), reducing refresh rate");
        OctoPrint.socket.decreaseRate();
    };

    OctoPrint.socket.onReconnectAttempt = self._onReconnectAttempt;
    OctoPrint.socket.onReconnectFailed = self._onReconnectFailed;
    OctoPrint.socket.onRateTooHigh = self._onDecreaseRate;
    OctoPrint.socket.onRateTooLow = self._onIncreaseRate;
    OctoPrint.socket
        .onMessage("connected", self._onConnected)
        .onMessage("history", self._onHistoryData)
        .onMessage("current", self._onCurrentData)
        .onMessage("slicingProgress", self._onSlicingProgress)
        .onMessage("event", self._onEvent)
        .onMessage("timelapse", self._onTimelapse)
        .onMessage("plugin", self._onPluginMessage);
}
