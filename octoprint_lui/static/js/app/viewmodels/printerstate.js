$(function () {
    function PrinterStateViewModel(parameters) {
        // TODO Adapt to LUI
        var self = this;

        self.loginState = parameters[0];
        self.flyout = parameters[1];
        self.temperatureState = parameters[2];
        self.settings = parameters[3];

        self.stateString = ko.observable(undefined);
        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);
        self.isSdReady = ko.observable(undefined);

        self.filename = ko.observable(undefined);
        self.progress = ko.observable(undefined);
        self.filesize = ko.observable(undefined);
        self.filepos = ko.observable(undefined);
        self.printTime = ko.observable(undefined);
        self.printTimeLeft = ko.observable(undefined);
        self.sd = ko.observable(undefined);
        self.timelapse = ko.observable(undefined);

        self.warningVm = undefined;

        self.filenameNoExtension = ko.computed(function () {
            if (self.filename())
                return self.filename().slice(0, (self.filename().lastIndexOf(".") - 1 >>> 0) + 1);
        })

        self.busyFiles = ko.observableArray([]);

        self.enablePrint = ko.computed(function () {
            return self.isOperational() && self.isReady() && !self.isPrinting() && self.loginState.isUser() && self.filename() != undefined;
        });
        self.enablePause = ko.computed(function () {
            return self.isOperational() && (self.isPrinting() || self.isPaused()) && self.loginState.isUser();
        });
        self.enableCancel = ko.computed(function () {
            return self.isOperational() && (self.isPrinting() || self.isPaused()) && self.loginState.isUser();
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

        self.estimatedPrintTimeString = ko.computed(function () {
            if (self.lastPrintTime())
                return formatDuration(self.lastPrintTime());
            if (self.estimatedPrintTime())
                return formatDuration(self.estimatedPrintTime());
            return "-";
        });
        self.byteString = ko.computed(function () {
            if (!self.filesize())
                return "-";
            var filepos = self.filepos() ? formatSize(self.filepos()) : "-";
            return filepos + " / " + formatSize(self.filesize());
        });
        self.heightString = ko.computed(function () {
            if (!self.currentHeight())
                return "-";
            return _.sprintf("%.02fmm", self.currentHeight());
        });
        self.printTimeString = ko.computed(function () {
            if (!self.printTime())
                return "-";
            return formatDuration(self.printTime());
        });
        self.printTimeLeftString = ko.computed(function () {
            if (self.printTimeLeft() == undefined) {
                if (!self.printTime() || !(self.isPrinting() || self.isPaused())) {
                    return "-";
                } else {
                    return gettext("Calculating...");
                }
            } else {
                return formatFuzzyEstimation(self.printTimeLeft());
            }
        });
        self.progressString = ko.computed(function () {
            if (!self.progress())
                return 0;
            return self.progress();
        });
        self.pauseString = ko.computed(function () {
            if (self.isPaused())
                return gettext("Continue");
            else
                return gettext("Pause");
        });

        self.leftFilament = ko.computed(function () {
            filaments = self.filament();
            for (var key in filaments) {
                if (filaments[key].name() == "Tool 1") {
                    return formatFilament(filaments[key].data());
                }
            }
            return "-"
        });

        self.rightFilament = ko.computed(function () {
            filaments = self.filament();
            for (var key in filaments) {
                if (filaments[key].name() == "Tool 0") {
                    return formatFilament(filaments[key].data());
                }
            }
            return "-"
        });

        self.stateStepString = ko.computed(function () {
            if (self.temperatureState.isHeating()) return "Heating";
            return self.stateString();
        });

        self.stateStepColor = ko.computed(function () {
            if (self.temperatureState.isHeating()) return "bg-orange"
            if (self.isPrinting()) return "bg-main"
            if (self.isError()) return "bg-red"
            return "bg-none"
        });


        self.fileSelected = ko.computed(function () {
            if (self.filename())
                return true
            else
                return false
        });

        self.timelapseString = ko.computed(function () {
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

            self.stateString(gettext(data.text));
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isSdReady(data.flags.sdReady);

            if (self.isPaused() != prevPaused) {
                if (self.isPaused()) {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_PAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_PAUSED);
                } else {
                    self.titlePrintButton(self.TITLE_PRINT_BUTTON_UNPAUSED);
                    self.titlePauseButton(self.TITLE_PAUSE_BUTTON_UNPAUSED);
                }
            }
        };

        self._processJobData = function (data) {
            if (data.file) {
                self.filename(data.file.name);
                self.filesize(data.file.size);
                self.sd(data.file.origin == "sdcard");
            } else {
                self.filename(undefined);
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
                        name: ko.observable(gettext("Tool") + " " + key.substr("tool".length)),
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

        self.print = function () {

            // if (self.filament)
            // var text = "You are about to update a component of the User Interface.";
            // var question = "Do want to update " + data.name() + "?";
            // var title = "Update: " + data.name()
            // var dialog = {'title': title, 'text': text, 'question' : question};
            var data = {};
            self.flyout.showConfirmationFlyout(data)
                .done(function () {
                    OctoPrint.job.start();
                });
        };

        self.pause = function () {
            OctoPrint.job.pause();
        };

        self.cancel = function () {
            OctoPrint.job.cancel();
        };

        self.showFileSelectFlyout = function () {
            self.flyout.showFlyout('file')
                .done(function () {
                });
        };

        self.showInfoFlyout = function () {
            self.flyout.showFlyout('info')
                .done(function () {
                });
        };

        self.showStartupFlyout = function (isHoming) {
            $('.startup_step').removeClass('active');

            if (isHoming)
                $('#startup_step_busy_homing').addClass('active');
            else
                $('#startup_step_prompt').addClass('active');

            self.flyout.showFlyout('startup', true);
        }

        self.closeStartupFlyout = function () {
            self.flyout.closeFlyoutAccept();
        }

        self.beginHoming = function () {
            self._sendApi({ command: "begin_homing" });
        }

        self.beginMaintenance = function ()
        {
            self.flyout.closeFlyout();

            self.settings.showSettingsTopic('maintenance', true)
            .always(function ()
            {
                self.showStartupFlyout(false);
            });
        }
        
        self.showBusyHoming = function () {
            $('.startup_step').removeClass('active');
            $('#startup_step_busy_homing').addClass('active');
        }

        self.onDoorOpen = function () {
            if (self.warningVm === undefined) {
                self.warningVm = self.flyout.showWarning('Door open',
                    'Please close the door before you continue printing.');
            }
        }
        self.onDoorClose = function () {
            if (self.warningVm !== undefined) {
                self.flyout.closeWarning(self.warningVm);
                self.warningVm = undefined;
            }
        }

        self.fromResponse = function (data) {
            if (!data.is_homed) {
                self.showStartupFlyout(data.is_homing);
            }
        }

        // Api send functions
        
        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            OctoPrint.postJson(url, data);
        };

        self.requestData = function () {
            OctoPrint.simpleApiGet('lui', {
                success: self.fromResponse
            });
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            //console.log(data);

            var messageType = data['type'];
            var messageData = data['data'];
            switch (messageType) {
                case "is_homed":
                    if(self.flyout.flyoutName == "startup")
                        self.closeStartupFlyout();
                    break;
                case "is_homing":
                    self.showBusyHoming();
                    break;
                case "door_open":
                    self.onDoorOpen();
                    break;
                case "door_closed":
                    self.onDoorClose();
                    break;
            }
        }

        self.onAfterBinding = function () {
            self.requestData();
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        PrinterStateViewModel,
        ["loginStateViewModel", "flyoutViewModel", "temperatureViewModel", "settingsViewModel"],
        ["#print", "#info_flyout", "#startup_flyout"]
    ]);
});
