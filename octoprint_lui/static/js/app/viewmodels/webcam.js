$(function () {
    function WebcamViewModel(parameters) {
        var self = this;

        self.flyout = parameters[0];
        self.loginState = parameters[1];
        self.printerState = parameters[2];
        self.settings = parameters[3];
        self.files = parameters[4];

        self.defaultFps = 25;
        self.defaultPostRoll = 0;
        self.defaultInterval = 10;
        //self.defaultRetractionZHop = 0;

        self.webcam_previewUrl = ko.observable(undefined);
        self.copyProgressBar = undefined;

        self.timelapseType = ko.observable(undefined);
        self.timelapseTimedInterval = ko.observable(self.defaultInterval);
        self.timelapsePostRoll = ko.observable(self.defaultPostRoll);
        self.timelapseFps = ko.observable(self.defaultFps);
        //self.timelapseRetractionZHop = ko.observable(self.defaultRetractionZHop);

        //self.persist = ko.observable(false);
        self.isDirty = ko.observable(false);
        self.storageAvailable = ko.observable(undefined);

        self.isBusy = ko.pureComputed(function () {
            return self.printerState.isPrinting() || self.printerState.isPaused();
        });

        self.isCopying = ko.observable(false);

        self.timelapseEnabled = ko.pureComputed({
            read: function () {
                return self.timelapseType() == "timed";
            },
            write: function (value) {
                if (value)
                    self.timelapseType("timed");
                else
                    self.timelapseType("off");
            },
            owner: this
        });


        self.timelapseTypeSelected = ko.pureComputed(function () {
            return ("off" != self.timelapseType());
        });

        self.timelapseFpsEnabled = ko.pureComputed(function () {
            return ("timed" == self.timelapseType());
        });

        self.timelapsePostRollEnabled = ko.pureComputed(function () {
            return ("timed" == self.timelapseType());
        });

        self.timelapseTimedIntervalEnabled = ko.pureComputed(function () {
            return ("timed" == self.timelapseType());
        });

        self.timelapseTimedInterval.subscribe(function () {
            self.isDirty(true);
        });
        self.timelapsePostRoll.subscribe(function () {
            self.isDirty(true);
        });
        self.timelapseFps.subscribe(function () {
            self.isDirty(true);
        });

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "timelapseFiles",
            {
                "name": function (a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "creation": function (a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function (a, b) {
                    // sorts descending
                    if (a["bytes"] > b["bytes"]) return -1;
                    if (a["bytes"] < b["bytes"]) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            5 // Timelapse files per page
        );

        // initialize list helper for unrendered timelapses
        self.unrenderedListHelper = new ItemListHelper(
            "unrenderedTimelapseFiles",
            {
                "name": function (a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "creation": function (a, b) {
                    // sorts descending
                    if (a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function (a, b) {
                    // sorts descending
                    if (a["bytes"] > b["bytes"]) return -1;
                    if (a["bytes"] < b["bytes"]) return 1;
                    return 0;
                }
            },
            {
            },
            "name",
            [],
            [],
            5 // Timelapse files per page
        );

        self.refreshPreview = function () {
            previewUrl = '/webcam/?action=snapshot&timestamp=' + new Date().getTime();
         
            self.webcam_previewUrl(previewUrl);
        }

        self.startLivestream = function()
        {
            var width = 1280;
            var height = 765;

            if (width > screen.width || height > screen.height)
            {
                width = 640;
                height = 405;
            }

            window.open('/plugin/lui/webcamstream', '_blank', 'menubar=no,status=no,toolbar=no,width='+width+'px,height='+height+'px')
        }

        self.requestData = function () {
            OctoPrint.timelapse.get({ data: { unrendered: true } })
                .done(self.fromResponse);

            self._getApi({ command: "storage_info" }).done(function (storage_info) {
                self.storageAvailable(formatSize(storage_info.free) + " free");
            });
        };

        self.fromResponse = function (response) {
            var config = response.config;
            if (config === undefined) return;

            self.timelapseType(config.type);
            self.listHelper.updateItems(response.files);
            if (response.unrendered) {
                self.unrenderedListHelper.updateItems(response.unrendered);
            }

            if (config.type == "timed") {
                if (config.interval != undefined && config.interval > 0) {
                    self.timelapseTimedInterval(config.interval);
                }
            } else {
                self.timelapseTimedInterval(self.defaultInterval);
            }

            //if (config.type == "zchange") {
            //    if (config.retractionZHop != undefined && config.retractionZHop > 0) {
            //        self.timelapseRetractionZHop(config.retractionZHop);
            //    }
            //} else {
            //    self.timelapseRetractionZHop(self.defaultRetractionZHop);
            //}

            if (config.postRoll != undefined && config.postRoll >= 0) {
                self.timelapsePostRoll(config.postRoll);
            } else {
                self.timelapsePostRoll(self.defaultPostRoll);
            }

            if (config.fps != undefined && config.fps > 0) {
                self.timelapseFps(config.fps);
            } else {
                self.timelapseFps(self.defaultFps);
            }

            //self.persist(false);
            self.isDirty(false);
        };

        self.removeFile = function (filename) {
            OctoPrint.timelapse.delete(filename)
                .done(self.requestData);
        };

        self.removeAll = function () {

            var text = "You have opted to delete all finished timelapses.";
            var question = "Do you want to continue?";
            var title = "Delete all timelapses"
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog, true)
            .done(function () {
                return self._sendApi({ command: 'delete_all_timelapses' })
                    .done(function () {

                        $.notify({
                            title: gettext("Timelapses deleted"),
                            text: gettext("All timelapses were deleted.")
                        },
                            "success"
                        )
                    })
                .fail(function () {
                    $.notify({
                        title: gettext("Not all timelapses were deleted"),
                        text: gettext("Some timelapses could not be removed. Please try again.")
                    },
                            "warning"
                        )
                })
                .always(self.requestData);
            });
        }

        self.copyToUsb = function (filename) {
            self.isCopying(true);

            self._sendApi({
                command: "copy_timelapse_to_usb",
                filename: filename
            }).done(function () {
                self.setProgressBar(0);
                $.notify({ title: 'Timelapse copied', text: 'The timelapse has been copied to your USB drive.' }, 'success');
            }).fail(function () {
                $.notify({ title: 'Copying of timelapse failed', text: 'The timelapse could not be copied. Plese check if there is sufficient space available on the drive and try again.' }, 'error');
            }).always(function () {
                self.isCopying(false);
            });
        }

        self.removeUnrendered = function (name) {
            OctoPrint.timelapse.deleteUnrendered(name)
                .done(self.requestData);
        };

        self.renderUnrendered = function (name) {
            OctoPrint.timelapse.renderUnrendered(name)
                .done(self.requestData);
        };

        self.save = function () {
            var payload = {
                "type": self.timelapseType(),
                "postRoll": self.timelapsePostRoll(),
                "fps": self.timelapseFps(),
                "save": true
                //"save": self.persist()
            };

            if (self.timelapseType() == "timed") {
                payload["interval"] = self.timelapseTimedInterval();
            }

            //if (self.timelapseType() == "zchange") {
            //    payload["retractionZHop"] = self.timelapseRetractionZHop();
            //}

            OctoPrint.timelapse.saveConfig(payload)
                .done(self.fromResponse);
        };

        self.onStartup = function () {
            var copyProgress = $("#timelapse_copy_progress");
            self.copyProgressBar = copyProgress.find(".bg-orange");
        }

        self.onSettingsShown = function () {
            // TODO: Ensure all setting flyouts have this check
            if (self.settings.settingsTopic() == "Webcam") {
                self.requestData();
                self.refreshPreview();
            }
        }

        self.onBeforeSaveSettings = function () {
            self.save();
        }

        self.onEventPostRollStart = function (payload) {
            var title = gettext("Capturing timelapse postroll");

            var text;
            if (!payload.postroll_duration) {
                text = _.sprintf(gettext("Now capturing timelapse post roll, this will take only a moment..."), format);
            } else {
                var format = {
                    time: moment().add(payload.postroll_duration, "s").format("LT")
                };

                if (payload.postroll_duration > 60) {
                    format.duration = _.sprintf(gettext("%(minutes)d min"), { minutes: payload.postroll_duration / 60 });
                    text = _.sprintf(gettext("Now capturing timelapse post roll, this will take approximately %(duration)s (so until %(time)s)..."), format);
                } else {
                    format.duration = _.sprintf(gettext("%(seconds)d sec"), { seconds: payload.postroll_duration });
                    text = _.sprintf(gettext("Now capturing timelapse post roll, this will take approximately %(duration)s..."), format);
                }
            }

            $.notify({
                title: title,
                text: text
            }, "success");
        };

        self.onEventMovieRendering = function (payload) {
            $.notify({
                title: gettext("Rendering timelapse"),
                text: _.sprintf(gettext("Now rendering timelapse %(movie_prefix)s. Due to performance reasons it is not recommended to start a print job while a movie is still rendering."), payload),
            }, "success");
        };

        self.onEventMovieFailed = function (payload) {

            $.notify({
                title: gettext("Rendering failed"),
                text: _.sprintf(gettext("Rendering of timelapse %(movie_prefix)s failed."), payload)
            }, "error");
        };

        self.onEventMovieDone = function (payload) {
            $.notify({
                title: gettext("Timelapse ready"),
                text: _.sprintf(gettext("New timelapse %(movie_prefix)s is done rendering."), payload)
            },
                "success");

            self.requestData();
        };

        self._getApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.get(url, { data: data });
        };

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };

        self.setProgressBar = function (percentage) {
            self.copyProgressBar
                .css("width", percentage + "%")
        }

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];
            switch (messageType) {
                case "timelapse_copy_progress":
                    self.setProgressBar(messageData.percentage);
                    self.printerState.activities.push('Copying');
                    break;
                case "timelapse_copy_complete":
                    self.setProgressBar(0);
                    self.printerState.activities.remove('Copying');
                    break;
                case "timelapse_copy_failed":
                    self.setProgressBar(0);
                    self.printerState.activities.remove('Copying');
                    break;

            }
        }

    }

    ADDITIONAL_VIEWMODELS.push([
        WebcamViewModel,
        ["flyoutViewModel", "loginStateViewModel", "printerStateViewModel", "settingsViewModel", "gcodeFilesViewModel"],
        ["#webcam_settings_flyout_content", "#info_livestream"]
    ]);
});
