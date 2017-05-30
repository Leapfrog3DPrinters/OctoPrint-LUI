$(function () {
    function SettingsViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.printerProfiles = parameters[1];
        self.flyout = parameters[2];

        self.autoShutdown = ko.observable(undefined);

        self.allViewModels = [];

        self.receiving = ko.observable(false);
        self.sending = ko.observable(false);
        self.outstanding = [];

        self.settingsDialog = undefined;
        self.settings_dialog_update_detected = undefined;

        self.appearance_name = ko.observable(undefined);
        self.appearance_defaultLanguage = ko.observable();

        self.feature_modelSizeDetection = ko.observable(undefined);

        self.serial_autoconnect = ko.observable(undefined);
        self.serial_log = ko.observable(undefined);

        self.temperature_profiles = ko.observableArray(undefined);
        self.temperature_cutoff = ko.observable(undefined);

        self.terminalFilters = ko.observableArray([]);

        self.server_diskspace_warning = ko.observable();
        self.server_diskspace_critical = ko.observable();
        self.server_diskspace_warning_str = sizeObservable(self.server_diskspace_warning);
        self.server_diskspace_critical_str = sizeObservable(self.server_diskspace_critical);

        self.plugins_lui_zoffset = ko.observable();
        self.plugins_lui_action_door = ko.observable();
        self.plugins_lui_action_filament = ko.observable();
        self.plugins_lui_debug_lui = ko.observable();
        
        self.locallock_enabled = ko.observable(false);
        self.locallock_code = ko.observable(undefined);
        self.locallock_timeout = ko.observable(0);

        self.settings = undefined;
        self.lastReceivedSettings = undefined;

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
                    $.notify({ title: title, text: "\""  + profile.name + gettext('" already exists. Please ensure each profile has a unique name.') }, 'error');
                    return;
                }

                names.push(profile.name.toLowerCase());

                var printerProfile = self.printerProfiles.currentProfileData();

                var minTemp = printerProfile["materialMinTemp"]();
                var maxTemp = printerProfile["materialMaxTemp"]();
                if (isNaN(profile.extruder) || profile.extruder < minTemp || profile.extruder > maxTemp) {
                    $.notify({ title: title, text: "\"" + profile.name + _.sprintf(gettext('" must have an extruder temperature between %(mintemp)s &deg;C and %(maxtemp)s &deg;C.'), { "mintemp": minTemp, "maxtemp": maxTemp }) }, 'error');
                    return;
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

                // Wait for the toggle animation
                setTimeout(function(){
                    self.flyout.showWarning(data.title, data.text)
                }, 200)
            }

            self.sendAutoShutdownStatus(!toggle);
            return true;
        }

        self.sendAutoShutdownStatus = function(toggle)
        {
            sendToApi("printer/auto_shutdown/" + (toggle ? "on" : "off"));
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

        self.onSettingsShown = function () {
            self.requestData();
        };

        self.requestData = function (local) {
            console.log("Requesting settings");

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
            return getFromApi('settings')
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
            var specialMappings = {};

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
                ko.mapping.fromJS(serverChangedData, {}, self.settings);
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
                temperature: {
                    profiles: function(value) { self.temperature_profiles($.extend(true, [], value)); }
                },
                plugins:
                    {
                        lui: {
                            autoShutdown: function (value) { self.autoShutdown(value); }
                        }
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
            self.requestData();
        }

        self.onEventSettingsUpdated = function () {
            var preventSettingsRefresh = _.some(self.allViewModels, function(viewModel) {
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

        self.saveLockSettings = function () {
            if(!self.locallock_enabled){
                self.locallock_code(undefined);
            }
            else if (self.locallock_code() == undefined) {
                self.locallock_enabled(false);
            }

            sendToApi("printer/security/local/lock",
                {
                    lockCode: self.locallock_code(),
                    lockEnabled: self.locallock_enabled(),
                    lockTimeout: self.locallock_timeout()
                }
            );
            if(self.flyout.isFlyoutOpen('security_settings')){
                self.flyout.closeFlyout();
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        SettingsViewModel,
        ["loginStateViewModel", "printerProfilesViewModel", "flyoutViewModel"],
        ["#settings_flyouts"]
    ]);
});
