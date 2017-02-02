$(function () {
    function SettingsViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.users = parameters[1];
        self.printerProfiles = parameters[2];
        self.flyout = parameters[3];
        
        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.autoShutdown = ko.observable(undefined);

        self.allViewModels = [];

        self.receiving = ko.observable(false);
        self.sending = ko.observable(false);
        self.outstanding = [];

        self.settingsDialog = undefined;
        self.settings_dialog_update_detected = undefined;
        
        self.api_enabled = ko.observable(undefined);
        self.api_key = ko.observable(undefined);
        self.api_allowCrossOrigin = ko.observable(undefined);

        self.appearance_name = ko.observable(undefined);
        self.appearance_color = ko.observable(undefined);
        self.appearance_colorTransparent = ko.observable();
        self.appearance_defaultLanguage = ko.observable();

        self.printer_defaultExtrusionLength = ko.observable(undefined);

        self.webcam_streamUrl = ko.observable(undefined);
        self.webcam_snapshotUrl = ko.observable(undefined);
        self.webcam_ffmpegPath = ko.observable(undefined);
        self.webcam_bitrate = ko.observable(undefined);
        self.webcam_ffmpegThreads = ko.observable(undefined);
        self.webcam_watermark = ko.observable(undefined);
        self.webcam_flipH = ko.observable(undefined);
        self.webcam_flipV = ko.observable(undefined);
        self.webcam_rotate90 = ko.observable(undefined);

        self.feature_gcodeViewer = ko.observable(undefined);
        self.feature_temperatureGraph = ko.observable(undefined);
        self.feature_waitForStart = ko.observable(undefined);
        self.feature_sendChecksum = ko.observable("print");
        self.feature_sdSupport = ko.observable(undefined);
        self.feature_sdAlwaysAvailable = ko.observable(undefined);
        self.feature_swallowOkAfterResend = ko.observable(undefined);
        self.feature_repetierTargetTemp = ko.observable(undefined);
        self.feature_disableExternalHeatupDetection = ko.observable(undefined);
        self.feature_keyboardControl = ko.observable(undefined);
        self.feature_pollWatched = ko.observable(undefined);
        self.feature_ignoreIdenticalResends = ko.observable(undefined);
        self.feature_modelSizeDetection = ko.observable(undefined);

        self.serial_port = ko.observable();
        self.serial_baudrate = ko.observable();
        self.serial_portOptions = ko.observableArray([]);
        self.serial_baudrateOptions = ko.observableArray([]);
        self.serial_autoconnect = ko.observable(undefined);
        self.serial_timeoutConnection = ko.observable(undefined);
        self.serial_timeoutDetection = ko.observable(undefined);
        self.serial_timeoutCommunication = ko.observable(undefined);
        self.serial_timeoutTemperature = ko.observable(undefined);
        self.serial_timeoutTemperatureTargetSet = ko.observable(undefined);
        self.serial_timeoutSdStatus = ko.observable(undefined);
        self.serial_log = ko.observable(undefined);
        self.serial_additionalPorts = ko.observable(undefined);
        self.serial_additionalBaudrates = ko.observable(undefined);
        self.serial_longRunningCommands = ko.observable(undefined);
        self.serial_checksumRequiringCommands = ko.observable(undefined);
        self.serial_helloCommand = ko.observable(undefined);

        self.folder_uploads = ko.observable(undefined);
        self.folder_timelapse = ko.observable(undefined);
        self.folder_timelapseTmp = ko.observable(undefined);
        self.folder_logs = ko.observable(undefined);
        self.folder_watched = ko.observable(undefined);

        self.scripts_gcode_beforePrintStarted = ko.observable(undefined);
        self.scripts_gcode_afterPrintDone = ko.observable(undefined);
        self.scripts_gcode_afterPrintCancelled = ko.observable(undefined);
        self.scripts_gcode_afterPrintPaused = ko.observable(undefined);
        self.scripts_gcode_beforePrintResumed = ko.observable(undefined);
        self.scripts_gcode_afterPrinterConnected = ko.observable(undefined);
        self.scripts_gcode_beforePrinterDisconnected = ko.observable(undefined);

        self.temperature_profiles = ko.observableArray(undefined);
        self.temperature_cutoff = ko.observable(undefined);

        self.system_actions = ko.observableArray([]);

        self.terminalFilters = ko.observableArray([]);

        self.server_commands_systemShutdownCommand = ko.observable(undefined);
        self.server_commands_systemRestartCommand = ko.observable(undefined);
        self.server_commands_serverRestartCommand = ko.observable(undefined);

        self.server_diskspace_warning = ko.observable();
        self.server_diskspace_critical = ko.observable();
        self.server_diskspace_warning_str = sizeObservable(self.server_diskspace_warning);
        self.server_diskspace_critical_str = sizeObservable(self.server_diskspace_critical);


        self.settings = undefined;
        self.lastReceivedSettings = undefined;

        //Template observable 
        self.settingsTopic = ko.observable(undefined);

        // Webcam
        self.webcam_ffmpegPathText = ko.observable();
        self.webcam_ffmpegPathOk = ko.observable(false);
        self.webcam_ffmpegPathBroken = ko.observable(false);
        self.webcam_ffmpegPathReset = function () {
            self.webcam_ffmpegPathText("");
            self.webcam_ffmpegPathOk(false);
            self.webcam_ffmpegPathBroken(false);
        };

        self.addTemperatureProfile = function () {
            self.temperature_profiles.push({name: "New", extruder:0, bed:0});
        };

        self.removeTemperatureProfile = function(profile) {
            self.temperature_profiles.remove(profile);
        };

        self.saveTemperatureProfiles = function()
        {
            var names = [];
            var title = gettext("Materials");
            var profile = gettext('Profile "');

            for (var profile of self.temperature_profiles())
            {
                 // Ensures no strings are being sent to the back-end, and values can be compared to min-max
                profile.extruder = parseInt(profile.extruder);
                profile.bed = parseInt(profile.bed);

                if (names.indexOf(profile.name.toLowerCase()) > -1) {
                    $.notify({ title: title, text: profile + profile.name + '" already exists. Please ensure each profile has a unique name.' }, 'error');
                    return;
                }

                names.push(profile.name.toLowerCase());

                //TODO: 'Soft-code' these values
                if (LPFRG_MODEL == "Bolt") {
                    if (isNaN(profile.extruder) || profile.extruder < 150 || profile.extruder > 360) {
                        $.notify({ title: title, text: profile + profile.name + gettext('" must have an extruder temperature between 150 &deg;C and 360 &deg;C.') }, 'error');
                        return;
                    }
                } else
                {
                    if (isNaN(profile.extruder) || profile.extruder < 150 || profile.extruder > 275) {
                        $.notify({ title: title, text: profile + profile.name + gettext('" must have an extruder temperature between 150 &deg;C and 275 &deg;C.') }, 'error');
                        return;
                    }
                }

                if (isNaN(profile.bed) || profile.bed < 0) {
                    $.notify({ title: title, text: profile + profile.name + gettext('" must have a bed temperature of at least 0 &deg;C.') }, 'error');
                    return;
                }


            }

            self.flyout.closeFlyoutAccept();
        }

        self.addTerminalFilter = function () {
            self.terminalFilters.push({name: "New", regex: "(Send: M105)|(Recv: ok T:)"});
        };

        self.removeTerminalFilter = function(filter) {
            self.terminalFilters.remove(filter);
        };

        self.appearance_name.subscribeChanged(function(newValue, oldValue){
            if (newValue.toLowerCase() == "debug" || DEBUG_LUI) {
                $('#settings_debug_mode_check').removeClass('hide');
                $('#settings_debug_mode_text').removeClass('hide');

            } else {
                $('#settings_debug_mode_check').addClass('hide');
                $('#settings_debug_mode_text').addClass('hide');
            }
        });

        self.toggleAutoShutdown = function () {
            var toggle = self.autoShutdown();

            if (!toggle) {
                var data = {
                    title: gettext("Turn on auto shutdown"),
                    text: gettext("You are about to turn on auto shutdown. This will turn off the printer when the current job or next job that is started is finished. This setting resets after a shutdown of the machine.")
                };
                setTimeout(function(){
                    self.flyout.showWarning(data.title, data.text)
                }, 500)
            }

            self.sendAutoShutdownStatus(!toggle);
            return true;
        }

        self.sendAutoShutdownStatus = function(toggle)
        {
            var data = {
                command: "auto_shutdown",
                toggle: toggle
            };
            self._sendApi(data);
        }

        self.feature_modelSizeDetection.subscribeChanged(function(newValue, oldValue){
            var data = {
                title: gettext("Disable print analysis"),
                text: gettext("You are about to disable the print analysis feature. Doing so will allow you to print without the print check. This could result in bad prints and/or potential damages to the printer.")
            };
            if(!newValue && oldValue) {
                self.flyout.showConfirmationFlyout(data, true)
                .fail(function () {
                    self.feature_modelSizeDetection(true)
                });
            }

        });

        self.testWebcamStreamUrl = function () {
            if (!self.webcam_streamUrl()) {
                return;
            }

            var text = gettext("If you see your webcam stream below, the entered stream URL is ok.");
            var image = $('<img src="' + self.webcam_streamUrl() + '">');
            var message = $("<p></p>")
                .append(text)
                .append(image);
            showMessageDialog({
                title: gettext("Stream test"),
                message: message
            });
        };

        self.testWebcamSnapshotUrl = function(viewModel, event) {
            if (!self.webcam_snapshotUrl()) {
                return;
            }

            var target = $(event.target);
            target.prepend('<i class="icon-spinner icon-spin"></i> ');

            var errorText = gettext("Could not retrieve snapshot URL, please double check the URL");
            var errorTitle = gettext("Snapshot test failed");

            OctoPrint.util.testUrl(self.webcam_snapshotUrl(), {method: "GET", response: true})
                .done(function(response) {
                    $("i.icon-spinner", target).remove();

                    if (!response.result) {
                        showMessageDialog({
                            title: errorTitle,
                            message: errorText
                        });
                        return;
                    }

                    var content = response.response.content;
                    var mimeType = "image/jpeg";

                    var headers = response.response.headers;
                    if (headers && headers["mime-type"]) {
                        mimeType = headers["mime-type"];
                    }

                    var text = gettext("If you see your webcam snapshot picture below, the entered snapshot URL is ok.");
                    showMessageDialog({
                        title: gettext("Snapshot test"),
                        message: $('<p>' + text + '</p><p><img src="data:' + mimeType + ';base64,' + content + '" /></p>')
                    });
                })
                .fail(function () {
                    $("i.icon-spinner", target).remove();
                    showMessageDialog({
                        title: errorTitle,
                        message: errorText
                    });
                });
        };

        self.testWebcamFfmpegPath = function () {
            if (!self.webcam_ffmpegPath()) {
                return;
            }

            OctoPrint.util.testExecutable(self.webcam_ffmpegPath())
                .done(function(response) {
                    if (!response.result) {
                        if (!response.exists) {
                            self.webcam_ffmpegPathText(gettext("The path doesn't exist"));
                        } else if (!response.typeok) {
                            self.webcam_ffmpegPathText(gettext("The path is not a file"));
                        } else if (!response.access) {
                            self.webcam_ffmpegPathText(gettext("The path is not an executable"));
                        }
                    } else {
                        self.webcam_ffmpegPathText(gettext("The path is valid"));
                    }
                    self.webcam_ffmpegPathOk(response.result);
                    self.webcam_ffmpegPathBroken(!response.result);
                });
        };

        self.onSettingsShown = function () {
            self.requestData();
        };

        self.onSettingsHidden = function () {
            self.webcam_ffmpegPathReset();
        };

        self.requestData = function(local) {
            // handle old parameter format
            var callback = undefined;
            if (arguments.length == 2 || _.isFunction(local)) {
                var exc = new Error();
                log.warn("The callback parameter of SettingsViewModel.requestData is deprecated, the method now returns a promise, please use that instead. Stacktrace:", (exc.stack || exc.stacktrace || "<n/a>"));

                if (arguments.length == 2) {
                    callback = arguments[0];
                    local = arguments[1];
                } else {
                    callback = local;
                    local = false;
                }
            }

            // handler for any explicitely provided callbacks
            var callbackHandler = function () {
                if (!callback) return;
                try {
                    callback();
                } catch (exc) {
                    log.error("Error calling settings callback", callback, ":", (exc.stack || exc.stacktrace || exc));
                }
            };

            // if a request is already active, create a new deferred and return
            // its promise, it will be resolved in the response handler of the
            // current request
            if (self.receiving()) {
                var deferred = $.Deferred();
                self.outstanding.push(deferred);

                if (callback) {
                    // if we have a callback, we need to make sure it will
                    // get called when the deferred is resolved
                    deferred.done(callbackHandler);
                }

                return deferred.promise();
            }

            // perform the request
            self.receiving(true);
            return OctoPrint.settings.get()
                .done(function(response) {
                    self.fromResponse(response, local);

                    if (callback) {
                        var deferred = $.Deferred();
                        deferred.done(callbackHandler);
                        self.outstanding.push(deferred);
                    }

                    // resolve all promises
                    var args = arguments;
                    _.each(self.outstanding, function(deferred) {
                        deferred.resolve(args);
                    });
                    self.outstanding = [];
                })
                .fail(function () {
                    // reject all promises
                    var args = arguments;
                    _.each(self.outstanding, function(deferred) {
                        deferred.reject(args);
                    });
                    self.outstanding = [];
                })
                .always(function () {
                    self.receiving(false);
                });
        };


        /**
         * Fetches the settings as currently stored in this client instance.
         */
        self.getLocalData = function () {
            var data = {};
            if (self.settings != undefined) {
                data = ko.mapping.toJS(self.settings);
            }

            // some special read functions for various observables
            var specialMappings = {
                feature: {
                    externalHeatupDetection: function () { return !self.feature_disableExternalHeatupDetection()},
                    alwaysSendChecksum: function () { return self.feature_sendChecksum() == "always"},
                    neverSendChecksum: function () { return self.feature_sendChecksum() == "never"}
                },
                serial: {
                    additionalPorts : function () { return commentableLinesToArray(self.serial_additionalPorts()) },
                    additionalBaudrates: function () { return _.map(splitTextToArray(self.serial_additionalBaudrates(), ",", true, function(item) { return !isNaN(parseInt(item)); }), function(item) { return parseInt(item); }) },
                    longRunningCommands: function () { return splitTextToArray(self.serial_longRunningCommands(), ",", true) },
                    checksumRequiringCommands: function () { return splitTextToArray(self.serial_checksumRequiringCommands(), ",", true) }
                },
                scripts: {
                    gcode: function () {
                        // we have a special handler function for the gcode scripts since the
                        // server will always send us those that have been set already, so we
                        // can't depend on all keys that we support to be present in the
                        // original request we iterate through in mapFromObservables to
                        // generate our response - hence we use our observables instead
                        //
                        // Note: If we ever introduce sub categories in the gcode scripts
                        // here (more _ after the prefix), we'll need to adjust this code
                        // to be able to cope with that, right now it only strips the prefix
                        // and uses the rest as key in the result, no recursive translation
                        // is done!
                        var result = {};
                        var prefix = "scripts_gcode_";
                        var observables = _.filter(_.keys(self), function(key) { return _.startsWith(key, prefix); });
                        _.each(observables, function(observable) {
                            var script = observable.substring(prefix.length);
                            result[script] = self[observable]();
                        });
                        return result;
                    }
                }
            };

            var mapFromObservables = function(data, mapping, keyPrefix) {
                var flag = false;
                var result = {};

                // process all key-value-pairs here
                _.forOwn(data, function(value, key) {
                    var observable = key;
                    if (keyPrefix != undefined) {
                        observable = keyPrefix + "_" + observable;
                    }

                    if (mapping && mapping[key] && _.isFunction(mapping[key])) {
                        result[key] = mapping[key]();
                        flag = true;
                    } else if (_.isPlainObject(value)) {
                        // value is another object, we'll dive deeper
                        var subresult = mapFromObservables(value, (mapping && mapping[key]) ? mapping[key] : undefined, observable);
                        if (subresult != undefined) {
                            // we only set something on our result if we got something back
                            result[key] = subresult;
                            flag = true;
                        }
                    } else if (self.hasOwnProperty(observable)) {
                        result[key] = self[observable]();
                        flag = true;
                    }
                });

                // if we set something on our result (flag is true), we return result, else we return undefined
                return flag ? result : undefined;
            };

            // map local observables based on our existing data
            var dataFromObservables = mapFromObservables(data, specialMappings);

            data = _.extend(data, dataFromObservables);
            return data;
        };

        self.fromResponse = function(response, local) {
            // server side changes to set
            var serverChangedData;

            // client side changes to keep
            var clientChangedData;

            if (local) {
                // local is true, so we'll keep all local changes and only update what's been updated server side
                serverChangedData = getOnlyChangedData(response, self.lastReceivedSettings);
                clientChangedData = getOnlyChangedData(self.getLocalData(), self.lastReceivedSettings);
            } else  {
                // local is false or unset, so we'll forcefully update with the settings from the server
                serverChangedData = response;
                clientChangedData = undefined;
            }

            // last received settings reset to response
            self.lastReceivedSettings = response;

            if (self.settings === undefined) {
                self.settings = ko.mapping.fromJS(serverChangedData);
            } else {
                ko.mapping.fromJS(serverChangedData, self.settings);
            }

            // some special apply functions for various observables
            var specialMappings = {
                appearance: {
                    defaultLanguage: function(value) {
                        self.appearance_defaultLanguage("_default");
                        if (_.includes(self.locale_languages, value)) {
                            self.appearance_defaultLanguage(value);
                        }
                    }
                },
                feature: {
                    externalHeatupDetection: function(value) { self.feature_disableExternalHeatupDetection(!value) },
                    alwaysSendChecksum: function(value) { if (value) { self.feature_sendChecksum("always")}},
                    neverSendChecksum: function(value) { if (value) { self.feature_sendChecksum("never")}}
                },
                serial: {
                    additionalPorts : function(value) { self.serial_additionalPorts(value.join("\n"))},
                    additionalBaudrates: function(value) { self.serial_additionalBaudrates(value.join(", "))},
                    longRunningCommands: function(value) { self.serial_longRunningCommands(value.join(", "))},
                    checksumRequiringCommands: function(value) { self.serial_checksumRequiringCommands(value.join(", "))}
                },
                terminalFilters: function(value) { self.terminalFilters($.extend(true, [], value)) },
                temperature: {
                    profiles: function(value) { self.temperature_profiles($.extend(true, [], value)); }
                }
            };

            var mapToObservables = function(data, mapping, local, keyPrefix) {
                if (!_.isPlainObject(data)) {
                    return;
                }

                // process all key-value-pairs here
                _.forOwn(data, function(value, key) {
                    var observable = key;
                    if (keyPrefix !== undefined) {
                        observable = keyPrefix + "_" + observable;
                    }

                    var haveLocalVersion = local && local.hasOwnProperty(key);

                    if (mapping && mapping[key] && _.isFunction(mapping[key]) && !haveLocalVersion) {
                        // if we have a custom apply function for this, we'll use it
                        mapping[key](value);
                    } else if (_.isPlainObject(value)) {
                        // value is another object, we'll dive deeper
                        mapToObservables(value, (mapping && mapping[key]) ? mapping[key] : undefined, (local && local[key]) ? local[key] : undefined, observable);
                    } else if (!haveLocalVersion && self.hasOwnProperty(observable)) {
                        // if we have a matching observable, we'll use that
                        self[observable](value);
                    }
                });
            };

            mapToObservables(serverChangedData, specialMappings, clientChangedData);
        };

        self.saveData = function (data, successCallback, setAsSending) {
            callViewModels(self.allViewModels, "onBeforeSaveSettings");
            var options;
            if (_.isPlainObject(successCallback)) {
                options = successCallback;
            } else {
                options = {
                    success: successCallback,
                    sending: (setAsSending === true)
                };
            }

            self.sending(data === undefined || options.sending || false);

            if (data === undefined) {
                // we also only send data that actually changed when no data is specified
                data = getOnlyChangedData(self.getLocalData(), self.lastReceivedSettings);
            }

            return OctoPrint.settings.save(data)
                .done(function(data, status, xhr) {
                    self.receiving(true);
                    self.sending(false);
                    try {
                        self.fromResponse(data);
                        if (options.success) options.success(data, status, xhr);
                    } finally {
                        self.receiving(false);
                    }
                })
                .fail(function(xhr, status, error) {
                    self.sending(false);
                    if (options.error) options.error(xhr, status, error);
                })
                .always(function(xhr, status) {
                    if (options.complete) options.complete(xhr, status);
                });
        };

        self.onAllBound = function(allViewModels) {
            self.allViewModels = allViewModels;
        }

        self.onEventSettingsUpdated = function () {
            var preventSettingsRefresh = _.any(self.allViewModels, function(viewModel) {
                if (viewModel.hasOwnProperty("onSettingsPreventRefresh")) {
                    try {
                        return viewModel["onSettingsPreventRefresh"]();
                    } catch (e) {
                        log.warn("Error while calling onSettingsPreventRefresh on", viewModel, ":", e);
                        return false;
                    }
                } else {
                    return false;
                }
            });

            if (preventSettingsRefresh) {
                // if any of our viewmodels prevented this refresh, we'll just return now
                return;
            }
            // TODO THIS
            // if (self.isDialogActive()) {
            //     // dialog is open and not currently busy...
            //     if (self.sending() || self.receiving()) {
            //         return;
            //     }

            //     if (!hasDataChanged(self.getLocalData(), self.lastReceivedSettings)) {
            //         // we don't have local changes, so just fetch new data
            //         self.requestData();
            //     } else {
            //         // we have local changes, show update dialog
            //         self.settingsUpdatedDialog.modal("show");
            //     }
            // } else {
                // dialog is not open, just fetch new data
                self.requestData();
            // }
        };

        self.showSettingsTopic = function (topic, blocking) {
            self.settingsTopic(capitalize(topic));
            callViewModels(self.allViewModels, "onSettingsShown");
            callViewModels(self.allViewModels, "on" + self.settingsTopic()+ "SettingsShown");

            return self.flyout.showFlyout(topic + '_settings', blocking)
                .done(function ()  {
                    self.saveData();
                })
                .always(function ()  {
                    callViewModels(self.allViewModels, "onSettingsHidden");
                });
        };

        // Sending custom commands to the printer, needed for level bed for example.
        // format is: sendCustomCommand({type:'command',command:'M106 S255'})
        self.sendCustomCommand = function (command) {
            if (!command) return;

            var parameters = {};
            if (command.hasOwnProperty("input")) {
                _.each(command.input, function (input) {
                    if (!input.hasOwnProperty("parameter") || !input.hasOwnProperty("value")) {
                        return;
                    }

                    parameters[input.parameter] = input.value();
                });
            }

            if (command.hasOwnProperty("command") || command.hasOwnProperty("commands")) {
                var commands = command.commands || [command.command];
                OctoPrint.control.sendGcodeWithParameters(commands, parameters);
            } else if (command.hasOwnProperty("script")) {
                var script = command.script;
                var context = command.context || {};
                OctoPrint.control.sendGcodeScriptWithParameters(script, context, parameters);
            }

            if (command.showNotification) {
                var name = command.name || "";
                $.notify({
                    title: _.sprintf(gettext('Command "%(name)s" sent'), { name: name }),
                    text: _.sprintf(gettext(''), {})
                },
                    "success"
                );
            }
        };

        self.startZoffset = function () {
            self.flyout.closeFlyoutAccept();
            self.flyout.showFlyout('zoffset');

        };

        self.fromCurrentData = function (data) {
            self._processStateData(data.state);
        };

        self.fromHistoryData = function (data) {
            self._processStateData(data.state);
        };

        self._processStateData = function (data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        // Api send functions
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };


        // Translations code

        self.translations = new ItemListHelper(
            "settings.translations",
            {
                "locale": function (a, b) {
                    // sorts ascending
                    if (a["locale"].toLocaleLowerCase() < b["locale"].toLocaleLowerCase()) return -1;
                    if (a["locale"].toLocaleLowerCase() > b["locale"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {
            },
            "locale",
            [],
            [],
            0
        );
        

        self.translationUploadFilename = ko.observable();
        self.invalidTranslationArchive = ko.pureComputed(function() {
            var name = self.translationUploadFilename();
            return name !== undefined && !(_.endsWith(name.toLocaleLowerCase(), ".zip") || _.endsWith(name.toLocaleLowerCase(), ".tar.gz") || _.endsWith(name.toLocaleLowerCase(), ".tgz") || _.endsWith(name.toLocaleLowerCase(), ".tar"));
        });
        self.enableTranslationUpload = ko.pureComputed(function() {
            var name = self.translationUploadFilename();
            return name !== undefined && name.trim() != "" && !self.invalidTranslationArchive();
        });

        var auto_locale = {language: "_default", display: gettext("Autodetect from browser"), english: undefined};
        self.locales = ko.observableArray([auto_locale].concat(_.sortBy(_.values(AVAILABLE_LOCALES), function(n) {
            return n.display;
        })));
        self.locale_languages = _.keys(AVAILABLE_LOCALES);


        self.saveLanguage = function() {
            self.saveData()
                .done(function() {
                    self.flyout.closeFlyout()
                    location.reload(true);
                })
        }

        self.languageSelected = function(data) {
            return (data.language == self.appearance_defaultLanguage());
        }

    }

    OCTOPRINT_VIEWMODELS.push([
        SettingsViewModel,
        ["loginStateViewModel", "usersViewModel", "printerProfilesViewModel", "flyoutViewModel"],
        ["#settings", "#settings_flyouts"]
    ]);
});
