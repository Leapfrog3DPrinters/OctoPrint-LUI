$(function ()  {
    function PrinterStateViewModel(parameters) {
        // TODO Adapt to LUI
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.temperatureState = parameters[2];
        self.settings = parameters[3];
        self.system = parameters[4];

        self.stateString = ko.observable(undefined);
        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);
        self.isSdReady = ko.observable(undefined);

        self.waitingForPause = ko.observable(false);
        self.waitingForCancel = ko.observable(false);

        self.isHomed = ko.observable(undefined);
        self.isHoming = ko.observable(undefined);
        self.showChangelog = ko.observable(undefined);
        self.changelogContents = ko.observable(undefined);
        self.currentLuiVersion = ko.observable(undefined);

        self.firmwareUpdateRequired = ko.observable(false);
        self.firmwareVersionRequirement = ko.observable(undefined);

        self.filename = ko.observable(undefined);
        self.filepath = ko.observable(undefined);
        self.progress = ko.observable(undefined);
        self.filesize = ko.observable(undefined);
        self.filepos = ko.observable(undefined);
        self.printTime = ko.observable(undefined);
        self.printTimeLeft = ko.observable(undefined);
        self.sd = ko.observable(undefined);
        self.timelapse = ko.observable(undefined);

        // These are updated from the filament viewmodel
        self.leftFilamentMaterial = ko.observable(undefined);
        self.rightFilamentMaterial = ko.observable(undefined);

        self.printMode = ko.observable("normal");
        self.forcePrint = ko.observable(false);
        self.autoShutdownTimer = ko.observable(0);
        self.autoShutdownWaitOnRender = ko.observable(false);

        self.printPreviewUrl = ko.observable(undefined);
        self.warningVm = undefined;

        self.errorReason = ko.observable(undefined);
        self.erroredExtruder = ko.observable(undefined);
        self.errorStateString = ko.observable(undefined);
        self.isConnecting = ko.observable(false);

        self.currentActivity = ko.pureComputed(function ()  {
            if (self.activities().length > 0)
                return self.activities()[0];
            else
                return undefined;
        });

        self.activities = ko.observableArray([]);

        self.filenameNoExtension = ko.computed(function ()  {
            if (self.filename())
                return self.filename().slice(0, (self.filename().lastIndexOf(".") - 1 >>> 0) + 1);
        })

        self.busyFiles = ko.observableArray([]);

        self.enablePrint = ko.computed(function ()  {
            return self.isOperational() && self.isReady() && !self.isPrinting() && self.loginState.isUser() && self.filename() != undefined;
        });
        self.enablePause = ko.computed(function ()  {
            return self.isOperational() && (self.isPrinting() || self.isPaused()) && !self.waitingForPause() && self.loginState.isUser();
        });
        self.enableCancel = ko.computed(function ()  {
            return self.isOperational() && (self.isPrinting() || self.isPaused()) && self.loginState.isUser() && !self.waitingForCancel();
        });

        self.filament = ko.observableArray([]);
        self.estimatedPrintTime = ko.observable(undefined);
        self.lastPrintTime = ko.observable(undefined);

        self.currentHeight = ko.observable(undefined);

        self.TITLE_PRINT_BUTTON_PAUSED = gettext("Restarts the print job from the beginning");
        self.TITLE_PRINT_BUTTON_UNPAUSED = gettext("Starts the print job");
        self.TITLE_PAUSE_BUTTON_PAUSED = gettext("Resumes the print job");
        self.TITLE_PAUSE_BUTTON_UNPAUSED = gettext("Pauses the print job");

        self.titlePrintButton = ko.observable(self.TITLE_PRINT_BUTTON_UNPAUSED);
        self.titlePauseButton = ko.observable(self.TITLE_PAUSE_BUTTON_UNPAUSED);

        self.estimatedPrintTimeString = ko.computed(function ()  {
            if (self.lastPrintTime())
                return formatFuzzyPrintTime(self.lastPrintTime());
            if (self.estimatedPrintTime())
                return formatFuzzyPrintTime(self.estimatedPrintTime());
            return "-";
        });
        self.byteString = ko.computed(function ()  {
            if (!self.filesize())
                return "-";
            var filepos = self.filepos() ? formatSize(self.filepos()) : "-";
            return filepos + " / " + formatSize(self.filesize());
        });
        self.heightString = ko.computed(function ()  {
            if (!self.currentHeight())
                return "-";
            return _.sprintf("%.02fmm", self.currentHeight());
        });
        self.printTimeString = ko.computed(function ()  {
            if (!self.printTime())
                return "-";
            return formatDuration(self.printTime());
        });
        self.printTimeLeftString = ko.computed(function ()  {
            if (self.printTimeLeft() == undefined) {
                if (!self.printTime() || !(self.isPrinting() || self.isPaused())) {
                    return "-";
                } else {
                    return gettext("Calculating...");
                }
            } else {
                return formatFuzzyPrintTime(self.printTimeLeft());
            }
        });
        self.progressString = ko.computed(function ()  {
            if (!self.progress())
                return 0;
            return self.progress();
        });
        self.pauseString = ko.computed(function ()  {
            if (self.isPaused())
                return gettext("Continue");
            else
                return gettext("Pause");
        });

        self.leftFilament = ko.computed(function ()  {
            var filaments = self.filament();
            var filament = _.find(filaments, function (f) { return f.name == "tool1" });

            if (filament)
                return formatFilament(filament.data());
            else
                return "-";
        });

        self.rightFilament = ko.computed(function ()  {
            var filaments = self.filament();
            var filament = _.find(filaments, function (f) { return f.name == "tool0" });

            if(filament)
                return formatFilament(filament.data());
            else
                return "-";
        });

        // self.stateStepString = ko.computed(function ()  {
        //     if (self.temperatureState.isHeating()) return "Heating";
        //     return self.stateString();
        // });

        // self.stateStepColor = ko.computed(function ()  {
        //     if (self.temperatureState.isHeating()) return "bg-orange"
        //     if (self.isPrinting()) return "bg-main"
        //     if (self.isError()) return "bg-red"
        //     return "bg-none"
        // });


        self.fileSelected = ko.computed(function ()  {
            if (self.filename())
                return true
            else
                return false
        });

        self.timelapseString = ko.computed(function ()  {
            var timelapse = self.timelapse();

            if (!timelapse || !timelapse.hasOwnProperty("type"))
                return "-";

            var type = timelapse["type"];
            if (type == "zchange") {
                return gettext("On Z Change");
            } else if (type == "timed") {
                return gettext("Timed") + " (" + timelapse["options"]["interval"] + " " + gettext("sec") + ")";
            } else {
                return "-";
            }
        });

        self.fromCurrentData = function (data) {
            self._fromData(data);
        };

        self.fromHistoryData = function (data) {
            self._fromData(data);
        };

        self.fromTimelapseData = function (data) {
            self.timelapse(data);
        };

        self._fromData = function (data) {
            self._processStateData(data.state);
            self._processJobData(data.job);
            self._processProgressData(data.progress);
            self._processZData(data.currentZ);
            self._processBusyFiles(data.busyFiles);
        };

        self._processStateData = function (data) {
            var prevPaused = self.isPaused();
            var prevErrorOrClosed = self.isErrorOrClosed();

            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isSdReady(data.flags.sdReady);

            if (self.isErrorOrClosed()) {
                self.stateString(gettext('Error'));
                self.errorStateString(gettext(data.text))
            }
            else {
                self.stateString(gettext(data.text));
                self.errorStateString(undefined);
            }

            if (self.isPaused() != prevPaused) {
                if (self.isPaused()) {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_PAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_PAUSED);
                } else {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_UNPAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_UNPAUSED);
                }
            }

            if (self.isErrorOrClosed()) {
                if(!prevErrorOrClosed)
                    self.requestData(); // Retrieve error reason and based on that, maybe open flyout
            }
            else
            {
                if (self.isConnecting() && self.isOperational()) {
                    self.isConnecting(false);
                    self.requestData(); // Close flyout based on new intel
                }
            }

            
        };

        self.onEventError = function (payload) {
            if (self.isConnecting()) {
                $.notify({
                    title: gettext("Could not restore printer connection"),
                    text: gettext('The printer connection could not be restored. Please consult your printer\'s manual')
                }, {
                    className: "error",
                    autoHide: false
                });

                self.isConnecting(false); // Restore connecting state
            } else 
            {
                self.requestData();
            }
        };

        self.onEventPrintPaused = function (payload)
        {
            // Enable resume button
            self.waitingForPause(false);
        }

        self.onEventPrintCancelled = function (payload) {
            // Enable start button
            self.waitingForCancel(false);
        }

        self.onEventPrintResumed = function (payload)
        {
            // Enable pause button
            self.waitingForPause(false);
        }

        self._processJobData = function (data) {
            if (data.file) {
                // Remove any possible hidden folder name
                if (data.file.name && data.file.name.startsWith("."))
                    self.filename(data.file.name.slice(data.file.name.indexOf('/')+1));
                else
                    self.filename(data.file.name);

                self.filepath(data.file.path);
                self.filesize(data.file.size);
                self.sd(data.file.origin == "sdcard");
            } else {
                self.filename(undefined);
                self.filepath(undefined);
                self.filesize(undefined);
                self.sd(undefined);
            }

            self.estimatedPrintTime(data.estimatedPrintTime);
            self.lastPrintTime(data.lastPrintTime);

            var result = [];
            if (data.filament && typeof (data.filament) == "object" && _.keys(data.filament).length > 0) {
                for (var key in data.filament) {
                    if (!_.startsWith(key, "tool") || !data.filament[key] || !data.filament[key].hasOwnProperty("length") || data.filament[key].length <= 0) continue;

                    result.push({
                        name: key,
                        data: ko.observable(data.filament[key])
                    });
                }
            }
            self.filament(result);
        };

        self._processProgressData = function (data) {
            if (data.completion) {
                self.progress(data.completion);
            } else {
                self.progress(undefined);
            }
            self.filepos(data.filepos);
            self.printTime(data.printTime);
            self.printTimeLeft(data.printTimeLeft);
        };

        self._processZData = function (data) {
            self.currentHeight(data);
        };

        self._processBusyFiles = function (data) {
            var busyFiles = [];
            _.each(data, function (entry) {
                if (entry.hasOwnProperty("name") && entry.hasOwnProperty("origin")) {
                    busyFiles.push(entry.origin + ":" + entry.name);
                }
            });
            self.busyFiles(busyFiles);
        };

        self.enableForcePrint = function () {
            var title = gettext("By-pass print analysis");
            var message = "<i class='fa fa-exclamation-triangle'></i>" + gettext(" You are trying to start a print while the analysis has not been completed yet. This enables you to start a print in a mode that might not be supported. This could potentially damage your printer.");
            var question = gettext("Do you want to by-pass the print analysis and start the print?");
            var dialog = {title: title, text: message, question: question};
            self.flyout.showConfirmationFlyout(dialog, true)
                .done(function(){ 
                    self.forcePrint(true);
                });
        };

        self.print = function ()  {

            self.printMode("normal");
            self.forcePrint(false);
            self.flyout.showFlyout("mode_select");
        };

        self.pause = function () {

            if (self.isPaused()) {
                var needed = self.filament();

                var needsLeft = _.some(needed,  {name: 'tool1' });
                var needsRight = _.some(needed, {name: 'tool0' });
                
                var materialLeft = self.leftFilamentMaterial();
                var materialRight = self.rightFilamentMaterial();

                var message = undefined;
                if (self.printMode() != "normal" && (materialLeft == "None" || materialRight == "None"))
                    message = gettext("Please load filament in both the left and right extruder before you resume your print.")
                else if (needsLeft && materialLeft  == "None")
                    message = gettext("Please load filament in the left extruder before you resume your print.")
                else if (needsRight && materialRight == "None")
                    message = gettext("Please load filament in the right extruder before you resume your print.")
                
                if (message) {
                    $.notify({ title: gettext('Cannot resume print'), text: message }, "error");
                }
                else {
                    self.waitingForPause(true);

                    OctoPrint.job.togglePause();
                }
            }
            else {
                self.waitingForPause(true);
                $.notify({
                    title: gettext("Print pausing"),
                    text: gettext('Please wait while the print is being paused.')
                }, {
                    className: "warning",
                    autoHide: true
                });
                OctoPrint.job.togglePause();
            }
        };

        self.cancel = function ()  {
            var title = gettext("Cancel print");
            var message = _.sprintf(gettext("You are about to cancel %(filename)s."), {filename: self.filenameNoExtension()});
            var question = gettext("Are you sure you want to cancel this print?");
            var ok_text = gettext("Yes");
            var cancel_text = gettext("No");
            var dialog = {title: title, text: message, question: question, ok_text: ok_text, cancel_text: cancel_text};
            self.flyout.showConfirmationFlyout(dialog)
                .done(function () {
                    self.waitingForCancel(true);

                    $.notify({
                        title: gettext("Print cancelling"),
                        text: gettext('Please wait while the print is being cancelled.')
                    }, {
                        className: "warning",
                        autoHide: true
                    });

                    OctoPrint.job.cancel()
                });
        };

        self.gotoFileSelect = function ()  {
            changeTabTo("files");
        };

        self.showInfoFlyout = function ()  {
            self.flyout.showFlyout('info')
                .done(function ()  {
                });
        };

        self.showStartupFlyout = function () {
            if(!self.flyout.isFlyoutOpen('startup'))
                self.flyout.showFlyout('startup', true);
        }

        self.updateChangelogContents = function()
        {
            OctoPrint.simpleApiGet('lui', {
                data: {
                    command: 'changelog_contents'
                },
                success: function (data) {
                    self.changelogContents(data.changelog_contents);
                    self.currentLuiVersion(data.lui_version);
                }
            });
        }

        self.showChangelogFlyout = function (updateContents) {
            
            if (updateContents)
            {
                self.updateChangelogContents();
            }

            self.flyout.showFlyout('changelog', true)
                .always(function() {
                    if (self.showChangelog()) {
                        self._sendApi({command: "changelog_seen"});
                    }
                });
        }

        self.showFirmwareUpdateRequiredFlyout = function()
        {
            self.flyout.showFlyout('firmware_update_required', true);
        }

        self.closeFirmwareUpdateRequiredFlyout = function () {
            self.flyout.closeFlyoutAccept("firmware_update_required");
        }

        self.closeStartupFlyout = function ()  {
            self.flyout.closeFlyoutAccept('startup');
        }

        self.beginHoming = function ()  {
            self._sendApi({ command: "begin_homing" });
        }

        self.beginMaintenance = function () 
        {

            self.settings.showSettingsTopic('maintenance', true)
        }

        self.cancelAutoShutdown = function () {
            self._sendApi({command: 'auto_shutdown_timer_cancel'});
        }

        self.onDoorOpen = function ()  {
            if (self.warningVm === undefined) {
                self.warningVm = self.flyout.showWarning(gettext('Door open'),
                    gettext('Please close the door before you continue printing.'));
            }
        }
        self.onDoorClose = function ()  {
            if (self.warningVm !== undefined) {
                self.flyout.closeWarning(self.warningVm);
                self.warningVm = undefined;
            }
        }

        self.showPrinterErrorFlyout = function () {
            if (!self.flyout.isFlyoutOpen('printer_error'))
                self.flyout.showFlyout('printer_error', true);
        }

        self.closePrinterErrorFlyout = function () {
            self.flyout.closeFlyout('printer_error');
            self.isConnecting(false);
        }

        self.restorePrinterConnection = function()
        {
            self.isConnecting(true);
            self._sendApi({ command: 'connect_after_error' }); // On success, closeFlyout will set isConnecting to false. OnFail onEventError will

        }

        self.refreshPrintPreview = function(url)
        {
            var filename = self.filepath(); // Includes subfolder

            if (url)
            {
                self.printPreviewUrl(url);
            }
            else if (filename)
            {
                $.get('/plugin/gcoderender/previewstatus', { filename: filename, make: true })
                    .done(function (data)
                     {
                        if(data.status == 'ready')
                            self.printPreviewUrl(data.previewUrl);
                        else
                            self.printPreviewUrl(undefined)
                    }).fail(function()
                    {
                        self.printPreviewUrl(undefined)
                    })
            } 
            else
                self.printPreviewUrl(undefined);
        }

        self.fromResponse = function (data) {
            self.isHomed(data.is_homed);
            self.isHoming(data.is_homing)
            self.showChangelog(data.show_changelog);

            self.changelogContents(data.changelog_contents);
            self.currentLuiVersion(data.lui_version);

            self.firmwareUpdateRequired(data.firmware_update_required);
            self.firmwareVersionRequirement(data.firmware_version_requirement);

            self.settings.autoShutdown(data.auto_shutdown);


            // Startup flyout priority:
            // 1. Printer error
            // 2. Firmware update required
            // 3. Changelog
            // 4. Startup flyout (homing/maintenance)
            
            // This fromResponse method is also called after a firmware update and printer error/disconnect

            if (data.firmware_update_required)
                self.showFirmwareUpdateRequiredFlyout();
            else {
                self.closeFirmwareUpdateRequiredFlyout();

                if (!self.isHomed()) {
                    self.showStartupFlyout();
                }
              
                if (self.showChangelog()) {
                    self.showChangelogFlyout();
                }
            }

            if (data.printer_error_reason) {
                self.errorReason(data.printer_error_reason);
                self.erroredExtruder(data.printer_error_extruder);
                self.showPrinterErrorFlyout();
            }
            else {
                self.closePrinterErrorFlyout();
                self.erroredExtruder(undefined);
                self.errorReason(undefined);
            }
        }

        // Api send functions
        
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        self.requestData = function ()  {
            self.refreshPrintPreview();

            OctoPrint.simpleApiGet('lui', {
                success: self.fromResponse
            });
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            var messageType = data['type'];
            var messageData = data['data'];

            if(plugin == "gcoderender")
            {
                console.log(messageType)
                switch (messageType) {
                    case "gcode_preview_rendering":
                        if (messageData.filename == self.filename()) {
                            self.printPreviewUrl(undefined); // Remove old preview
                            self.activities.push(gettext('Previewing'));
                        }
                        break;
                    case "gcode_preview_ready":
                        if (messageData.filename == self.filename()) {
                            self.refreshPrintPreview(messageData.previewUrl);
                            self.activities.remove(gettext('Previewing'));
                        }
                        break;
                }
            }
            else if (plugin == "lui") {

                switch (messageType) {
                    case "is_homed":
                        self.isHomed(true);
                        self.isHoming(false);
                        //if (self.flyout.currentFlyoutTemplate == "#startup_flyout")
                        self.closeStartupFlyout();
                        break;
                    case "is_homing":
                        self.isHomed(false);
                        self.isHoming(true);
                        break;
                    case "door_open":
                        self.onDoorOpen();
                        break;
                    case "door_closed":
                        self.onDoorClose();
                        break;
                    case "auto_shutdown_toggle":
                        self.settings.autoShutdown(messageData.toggle);
                        break;
                    case "auto_shutdown_start":
                        self.flyout.showFlyout("auto_shutdown", true)
                        self.autoShutdownTimer(180);
                        break;
                    case "auto_shutdown_wait_on_render":
                        self.autoShutdownWaitOnRender(true);
                        break;
                    case "auto_shutdown_timer":
                        if (!$('#auto_shutdown_flyout').hasClass('active')) {
                            self.flyout.showFlyout("auto_shutdown", true);
                        }
                        self.autoShutdownWaitOnRender(false);
                        self.autoShutdownTimer(messageData.timer);
                        break;
                    case "auto_shutdown_timer_cancelled":
                        self.flyout.closeFlyout();
                        break;
                    case "printer_error_reason_update":
                        self.errorReason(messageData.printer_error_reason);
                        self.erroredExtruder(messageData.printer_error_extruder);
                        break;
                }
            }
        }

        self.updateAnalyzingActivity = function()
        {
            if (self.filename() && (!self.estimatedPrintTime() || self.filament().length == 0))
                self.activities.push('Analyzing');
            else
                self.activities.remove('Analyzing');
        }

        self.onBeforeBinding = function()
        {
            self.requestData();
        }

        self.onStartupComplete = function ()  {
            
            self.filepath.subscribe(function ()  {
                self.activities.remove(gettext('Creating preview'));
                self.updateAnalyzingActivity();
                self.refreshPrintPreview(); // Important to pass no parameters 
            });

            self.estimatedPrintTime.subscribe(self.updateAnalyzingActivity);
            self.filament.subscribe(self.updateAnalyzingActivity);
        }

        //TODO: Remove!
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        }

        //TODO: Remove!
        self.doDebuggingAction = function () {
            self._sendApi({
                command: "trigger_debugging_action"
            });
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        PrinterStateViewModel,
        ["loginStateViewModel", "flyoutViewModel", "temperatureViewModel", "settingsViewModel", "systemViewModel"],
        ["#print", "#info_flyout", "#startup_flyout", "#auto_shutdown_flyout", "#changelog_flyout", "#printer_error_flyout"]
    ]);
});
