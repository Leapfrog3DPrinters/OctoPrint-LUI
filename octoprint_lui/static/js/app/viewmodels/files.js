$(function ()  {
    function FilesViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.loginState = parameters[1];
        self.printerState = parameters[2];
        self.flyout = parameters[3];
        self.printerProfiles=parameters[4];
        self.filament = parameters[5];
        self.network = parameters[6];
        self.cloud = parameters[7];
        self.navigation = parameters[8];
        self.introView = parameters[9];

        self.isIntroFile = ko.observable(false);
        self.isUsbAvailable = ko.observable(false);
        self.selectedFirmwareFile = ko.observable(undefined);
        self.currentOrigin = ko.observable("local");

        self.selectedFile = ko.observable(undefined);

        self.dimensions_warning_title = undefined;
        self.dimensions_warning_message = undefined;

        self.searchQuery = ko.observable(undefined);
        self.searchQuery.subscribe(function ()  {
            self.performSearch();
        });

        self.freeSpace = ko.observable(undefined);
        self.totalSpace = ko.observable(undefined);
        self.freeSpaceString = ko.computed(function ()  {
            if (!self.freeSpace())
                return "-";
            return formatSize(self.freeSpace()) + gettext(" free");
        });

        self.totalSpaceString = ko.computed(function ()  {
            if (!self.totalSpace())
                return "-";
            return formatSize(self.totalSpace());
        });

        self.wasDiskusageWarning = false;
        self.diskusageWarning = ko.computed(function ()  {
            return self.freeSpace() != undefined
                && self.freeSpace() < self.settings.server_diskspace_warning();
        });

        self.wasDiskusageCritical = false;
        self.diskusageCritical = ko.computed(function ()  {
            return self.freeSpace() != undefined
                && self.freeSpace() < self.settings.server_diskspace_critical();
        });
        self.diskusageString = ko.computed(function ()  {
            if (self.diskusageCritical()) {
                return gettext("Your available free disk space is critically low.");
            } else if (self.diskusageWarning()) {
                return gettext("Your available free disk space is starting to run low.");
            } else {
                return gettext("Your current disk usage.");
            }
        });

        self.showDiskUsageWarnings = function () {
            if (!self.wasDiskusageCritical && self.diskusageCritical()) {
                $.notify({
                    title: gettext("Disk space critically low!"),
                    text: gettext('Free some space by deleting jobs or timelapses to continue usage.')
                }, { className: "error", autoHide: false });

                self.wasDiskusageCritical = true;
            }
            else if (!self.wasDiskusageWarning && self.diskusageWarning()) {
                $.notify({
                    title: gettext("Disk space very low!"),
                    text: gettext('Please free some space by deleting jobs or timelapses.')
                }, { className: "warning", autoHide: false });

                self.wasDiskusageWarning = true;
            }
            else
            {
                self.wasDiskusageWarning = false;
                self.wasDiskusageCritical = false;
            }
        }

        self.uploadButton = undefined;
        self.uploadProgressBar = undefined;

        self.isLoadingFile = false;
        self.isLoadingFileList = ko.observable(false);

        self.allItems = ko.observable(undefined);
        self.listStyle = ko.observable("folders_files");
        self.currentPath = ko.observable("");

        self.gcodePreviews = [];

        self.isOnline = ko.pureComputed(function () {
            return self.network.status.ethernet.connected() || self.network.status.wifi.connected();
        })

        self.formatFilamentHeader = function (tool) {
            switch (tool) {
                case "tool0":
                    return gettext("Filament right:");
                case "tool1":
                    return gettext("Filament left:");
            }
        }

        var preProcessList = function (response) {
            var recursiveCheck = function (element, index, list) {
                if (!element.hasOwnProperty("parent")) element.parent = { children: list, parent: undefined };
                if (!element.hasOwnProperty("size")) element.size = undefined;
                if (!element.hasOwnProperty("date")) element.date = undefined;

                element.gcodeAnalysis = ko.observable(element.gcodeAnalysis);

                element.prints = ko.observable(element.prints);

                if (element.origin == "local" && !element.hasOwnProperty("previewUrl")) {
                    previewItem = self.gcodePreviews.find(function (item) { return item.filename.toLowerCase() == element["name"].toLowerCase(); });
                    if (previewItem)
                        element.previewUrl = ko.observable(previewItem.previewUrl);
                    else
                        element.previewUrl = ko.observable("");
                }

                if (element.type == "folder") {
                    _.each(element.children, function (e, i, l) {
                        e.parent = element;
                        recursiveCheck(e, i, l);
                    });
                }

            };
            _.each(response.files, recursiveCheck);
        };

        self.browseOrigin = function (origin, filenameToFocus)
        {
            if (self.isLoadingFileList())
                return;

            self.isLoadingFileList(true);

            var locationToFocus = undefined;
            var switchToPath = '';

            if (origin == "local" && filenameToFocus == undefined) {
                filenameToFocus = ''
                selectedFile = self.selectedFile();
                if (selectedFile) {
                    filenameToFocus = selectedFile.name;
                }
            }

            self.loadFiles(origin).done(preProcessList).then(function (response) {
                self.fromResponse(response, filenameToFocus, locationToFocus, switchToPath);
                self.currentOrigin(origin);
            })
            .fail(function () {
                if(origin == "usb")
                    $.notify({ title: gettext('USB access failed'), text: gettext('The USB drive could not be accessed. Please try again.') }, 'error');
            })
            .always(function () {
                self.isLoadingFileList(false);
            });

            if (origin == "local" && self.introView.isTutorialStarted) {
                self.isIntroFile(true);
                var checkIfFileVisible = setInterval(function () {
                    if($('#print_files').is(":visible")) {
                        self.introView.introInstance.refresh();
                        self.introView.introInstance.goToStep(self.introView.getStepNumberByName("selectFile"));
                    }
                    clearInterval(checkIfFileVisible);
                }, 100);
            }
        };

        self.browseUsbForFirmware = function ()  {
            if (self.isLoadingFileList())
                return;

            self.isLoadingFileList(true);
            filenameToFocus = '';
            locationToFocus = '';
            switchToPath = '';
            self.loadFiles("usb", "firmware")
                .done(preProcessList)
                .fail(self.notifyUsbFail)
                .then(function (response) {
                    self.fromResponse(response, filenameToFocus, locationToFocus, switchToPath);
                }).always(function ()  { self.isLoadingFileList(false); });
        }

        self.loadFiles = function (origin, filter, path) {
            filter = filter || "";
            path = path || "";
            
            if (filter)
                return getFromApi("files/" + origin + "/" + path + "?filter=" + filter);
            else
                return getFromApi("files/" + origin + "/" + path);
        }

        // initialize list helper
        self.listHelper = new ItemListHelper(
            "gcodeFiles",
            {
                "name": function (a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                },
                "upload": function (a, b) {
                    // sorts descending
                    if (b["date"] === undefined || a["date"] > b["date"]) return -1;
                    if (a["date"] < b["date"]) return 1;
                    return 0;
                },
                "size": function (a, b) {
                    // sorts descending
                    if (b["size"] === undefined || a["size"] > b["size"]) return -1;
                    if (a["size"] < b["size"]) return 1;
                    return 0;
                }
            },
            {
                "emptyFolder": function (data) {
                    // Hide the calibration folder
                    if (data["origin"] == "local" && data["type"] == "folder" && data["name"] == "calibration") {
                        return false;
                    }
                    else {
                        var children_check = true;
                        if (data["children"]) {
                            children_check = data["children"].length != 0;
                        } else {
                            children_check = false;
                        }
                        return data["origin"] == "cloud" || (data["type"] && (data["type"] != "folder" || data["weight"] > 0 || children_check));
                    }
                }
            },
            "name",
            ["emptyFolder"],
            [],
            0
        );

        self.foldersOnlyList = ko.dependentObservable(function ()  {
            var filter = function (data) { return data["type"] && data["type"] == "folder"; };
            return _.filter(self.listHelper.paginatedItems(), filter);
        });

        self.filesOnlyList = ko.dependentObservable(function ()  {
            var filter = function (data) { return data["type"] && data["type"] != "folder"; };
            return _.filter(self.listHelper.paginatedItems(), filter);
        });

        self.filesAndFolders = ko.dependentObservable(function ()  {
            var style = self.listStyle();
            if (style == "folders_files" || style == "files_folders") {
                var files = self.filesOnlyList();
                var folders = self.foldersOnlyList();

                if (style == "folders_files") {
                    return folders.concat(files);
                } else {
                    return files.concat(folders);
                }
            } else {
                return self.listHelper.paginatedItems();
            }
        });

        self.isLoadActionPossible = ko.computed(function ()  {
            return self.loginState.isUser() && !self.printerState.isPrinting() && !self.printerState.isPaused() && !self.printerState.isLoading() && !self.printerState.waitingForCancel();
        });

        self.isLoadAndPrintActionPossible = ko.computed(function ()  {
            return self.loginState.isUser() && self.printerState.isOperational() && self.isLoadActionPossible();
        });

        self.printerState.filename.subscribe(function (newValue) {
            self.highlightFilename(newValue);
        });


        self.listHelper.selectedItem.subscribe(function(newValue) {
            self.selectedFile(newValue);
        });

        self.highlightCurrentFilename = function () {
            self.highlightFilename(self.printerState.filename());
        };

        self.highlightFilename = function (filename) {
            if (filename == undefined) {
                self.listHelper.selectNone();
            } else {
                self.listHelper.selectItem(function (item) {
                    if (item.type == "folder") {
                        return _.startsWith(filename, item.path + "/");
                    } else {
                        return item.path == filename;
                    }
                });
            }
        };

        self._otherRequestInProgress = false;
        self.requestData = function (filenameToFocus, locationToFocus, switchToPath) {
            if (self._otherRequestInProgress) return;

            if (self.gcodePreviews.length == 0)
            {
                // On first attempt, fetch all a list of filenames which have previews available
                $.get('/plugin/gcoderender/allpreviews')
                    .done(function (data) {
                        self.gcodePreviews = data.previews;
                    }).always(function ()  {
                        self.browseOrigin("local",filenameToFocus);
                    });

            }
            else
            {
                self.browseOrigin("local",filenameToFocus);
            }

        };

        self.focusOnFile = function(filenameToFocus, locationToFocus)
        {
            if (filenameToFocus) {
                // got a file to scroll to
                if (locationToFocus === undefined) {
                    locationToFocus = "local";
                }
                var entryElement = self.getEntryElement({ name: filenameToFocus, origin: locationToFocus });
                if (entryElement) {
                    var container = $('#files');
                    var scrollTo = $(entryElement);

                    setTimeout(function () {
                        container.animate({
                            scrollTop: scrollTo.offset().top - container.offset().top + container.scrollTop() - 60
                        }, 500, 'swing');
                    }, 100);
                }
            }
        }

        self.fromResponse = function (response, filenameToFocus, locationToFocus, switchToPath) {
            var files = response.files;

            self.allItems(files);
            self.currentPath("");


            if (!switchToPath) {
                self.listHelper.updateItems(files);
            } else {
                self.changeFolderByPath(switchToPath);
            }

            self.focusOnFile(filenameToFocus, locationToFocus);

            if (response.free != undefined) {
                self.freeSpace(response.free);
            }

            if (response.total != undefined) {
                self.totalSpace(response.total);
            }

            self.showDiskUsageWarnings();

            self.highlightCurrentFilename();
        };

        self.changeFolder = function (data) {

            if (!data.children) {
                self.loadChildrenAndBrowse(data);
            }
            else {
                self.currentPath(data.path);
                self.listHelper.updateItems(data.children);
                self.highlightCurrentFilename();
            }
        };

        self.loadChildrenAndBrowse = function (folder)
        {
            if (self.isLoadingFileList())
                return;

            self.isLoadingFileList(true);
            self.loadFiles(folder.origin, "", folder.path).done(preProcessList).then(function (children) {
                folder.children = children.files;
                self.currentPath(folder.path);
                self.listHelper.updateItems(folder.children);
                self.highlightCurrentFilename();
            }).fail(function()
            {
                $.notify({
                    title: gettext("Could not open folder"),
                    text: gettext("The folder could not be opened. Please check if your printer is connected to the internet.")
                }, "error");
            }).always(function () {
                self.isLoadingFileList(false);
            });
        }

        self.navigateUp = function ()  {
            var path = self.currentPath().split("/");
            path.pop();
            self.changeFolderByPath(path.join("/"));
        };

        self.changeFolderByPath = function (path) {
            var element = self.elementByPath(path);
            if (element) {
                self.currentPath(path);
                self.listHelper.updateItems(element.children);
            } else {
                self.currentPath("");
                self.listHelper.updateItems(self.allItems());
            }
            self.highlightCurrentFilename();
        };

        self.elementByPath = function (path, root) {
            root = root || { children: self.allItems() };

            var recursiveSearch = function (location, element) {
                if (location.length == 0) {
                    return element;
                }

                if (!element.hasOwnProperty("children")) {
                    return undefined;
                }

                var name = location.shift();
                for (var i = 0; i < element.children.length; i++) {
                    if (name == element.children[i].name) {
                        return recursiveSearch(location, element.children[i]);
                    }
                }

                return undefined;
            };

            return recursiveSearch(path.split("/"), root);
        };

        self.showCloudSettings = function()
        {
            self.navigation.showSettingsTopic('cloud');
        }

        self.showAddFolderDialog = function ()  {
            if (self.addFolderDialog) {
                self.addFolderDialog.modal("show");
            }
        };


        self.loadFile = function (file, printAfterLoad) {
            if (!file || self.isLoadingFile) {
                return;
            }
            self.isLoadingFile = true;

            if (file.type == "firmware") {
                //Check if we're living in a flyout
                if (self.flyout.flyouts().length > 0) {
                    self.selectedFirmwareFile(file);
                    self.flyout.closeFlyoutAccept();
                }

                self.isLoadingFile = false;
            }
            else if (file.origin != "local") {
                sendToApi("files/select/" + file.origin + "/" + file.path)
                .done(function () {
                    self.setProgressBar(0);

                    if (printAfterLoad) {
                        self.printerState.print();
                    }

                    if (self.flyout.flyouts().length > 0)
                        self.flyout.closeFlyoutAccept();

                    self.browseOrigin("local",file.name);
                })
                .always(function () { self.isLoadingFile = false; })
            }
            else {
                OctoPrint.files.select(file.origin, file.path)
                        .done(function ()  {
                            if (printAfterLoad) {
                                self.printerState.print();
                            }
                            if (self.flyout.flyouts().length > 0)
                                self.flyout.closeFlyoutAccept();
                            // changeTabTo("print");
                        }).always(function ()  { self.isLoadingFile = false; });
            }

        };

        self.printAndChangeTab = function (datafile) {
            changeTabTo("print");
            self.printerState.print();
        };

        self.copyToUsb = function(file)
        {
            if (!file) {
                return;
            }

            // Errors are provided through socket messages
            sendToApi("usb/save/gcode/" + file.path);
        }

        self.copyAllToUsb = function () {
            // Errors are provided through socket messages
            sendToApi("usb/save_all/gcodes");
        }

        self.removeAllFiles = function()
        {

            var text = gettext("You have opted to delete all print jobs.");
            if (self.selectedFile())
                text += gettext(" This will not delete the currently selected file.");

            var question = gettext("Do you want to continue?");
            var title = gettext("Delete all jobs");
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog)
            .done(function ()  {
                return sendToApi('files/delete_all')
                    .done(function ()  {

                        $.notify({
                            title: gettext("Jobs deleted"),
                            text: gettext("All print jobs were deleted.")
                        },
                            "success"
                        )
                    })
                .fail(function()
                {
                    $.notify({
                        title: gettext("Not all jobs were deleted"),
                        text: gettext("Some files could not be removed. Please try again.")
                    },
                            "warning"
                        )
                })
                .always(function ()  { self.requestData(undefined, undefined, undefined); })
            });
        };

        self.removeFile = function (file) {
            if (!file) {
                return;
            }

            var index = self.listHelper.paginatedItems().indexOf(file) + 1;
            if (index >= self.listHelper.paginatedItems().length) {
                index = index - 2;
            }
            if (index < 0) {
                index = 0;
            }

            var filenameToFocus = undefined;
            var fileToFocus = self.listHelper.paginatedItems()[index];
            if (fileToFocus) {
                filenameToFocus = fileToFocus.name;
            }

            var text = gettext("You have opted to delete job: ") + file.name;
            var question = gettext("Do you want to delete this job?");
            var title = gettext("Delete job");
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog)
            .done(function () {
                OctoPrint.files.delete(file.origin, file.path)
                    .done(function () {

                        self.focusOnFile(filenameToFocus);
                        self.listHelper.removeItem(function (item) {
                           return item.path == file.path
                        });

                        $.notify({
                            title: gettext("File removed succesfully"),
                            text: _.sprintf(gettext('Removed file: "%(filename)s"'), {filename: file.name})},
                            "success"
                        )
                    })
            });
        };

        self.startPrint = function () {
            var mode = self.printerState.printMode();
            var file = self.selectedFile();

            var withinPrintDimensions = self.evaluatePrintDimensions(file, mode, true);

            if (withinPrintDimensions) {
                sendToApi('printer/start_print/' + mode);
                self.flyout.closeFlyoutAccept();
            }
            // do print stuff
            // close flyout.
            if(self.introView.isTutorialStarted){
                setTimeout(function () {
                    self.introView.introInstance.refresh();
                    self.introView.introInstance.goToStep(self.introView.getStepNumberByName("tutorialDone"));
                }, 200);
            }
        };

        self.isDualPrint = ko.computed(function(){
            // Checks if selected file uses both tools for printing.
            // At the moment tools is hardcoded, should be taken from
            // printer profile.
            // There is a length check in there, because the analyser
            // sometimes falsely puts some extrusion on one of the tools
            // at start up script (or something)
            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                var analysis = self.selectedFile()["gcodeAnalysis"]();
                if (!analysis) {
                    return false;
                }
                var filamentInfo = analysis['filament'];
                var requiredTools = ["tool0", "tool1"];
                var lengthThreshold = 100;

                if (requiredTools.every(function(t) { return t in filamentInfo})) {
                    return(_.every(filamentInfo, function(t){ return t['length'] > lengthThreshold}));
                } else {
                    return false;
                }

            }
        });

        self.isWithinPrintDimensionsSyncMirrorMode = ko.computed(function () {
            return true // 1.0.2 work around

            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                return self.evaluatePrintDimensions(self.selectedFile(), "sync", false);
            }
        });

        self.isWithinPrintDimensions = ko.computed(function () {
            return true // 1.0.2 work around

            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                return self.evaluatePrintDimensions(self.selectedFile(), "normal", false);
             }
        });

        self.gcodeAnalysisFinished = ko.computed(function(){
            return true // 1.0.2 work around
            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                var analysis = self.selectedFile()["gcodeAnalysis"]();
                return analysis ? true : false;
            }
        });

        self.enoughFilament = ko.computed(function () {
            var sufficient = false;

            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local") {
                var analysis = self.selectedFile()["gcodeAnalysis"]();
                if (!analysis) {
                    return true;
                }

                var neededFilaments = analysis['filament'];

                var mode = self.printerState.printMode();
                var lengthThreshold = 100;

                if (mode == "normal") {
                    sufficient = _.every(neededFilaments, function (tool, key) {
                        return (tool['length'] - lengthThreshold) < self.filament.getFilament(key).amount();
                    });

                } else if (mode == "sync" || mode == "mirror") {
                    var maxLength = 0.0;
                    _.each(neededFilaments, function (x) { maxLength = Math.max(maxLength, x.length); });

                    sufficient = _.every(self.filament.tools(), function (tool) {
                        return tool.filament.amount() >= maxLength;
                    });
                }
            }

            return sufficient;
        });

        self.evaluatePrintDimensions = function (data, mode, notify) {
            // This functionality is temporarily disabled for 1.0.8
            return true;

            if (!self.settings.feature_modelSizeDetection()) {
                return true;
            }

            if (self.printerState.forcePrint())
                return true;

            var analysis = data["gcodeAnalysis"]();
            if (!analysis) {
                // This should be false but is true atm to cater for the analysis blocking.
                return true;
            }

            var printingArea = analysis["printingArea"];
            if (!printingArea) {
                return true;
            }

            var dimensions = analysis["dimensions"];
            if (!dimensions) {
                return true;
            }

            var printerProfile = self.printerProfiles.currentProfileData();
            if (!printerProfile) {
                return true;
            }

            var volumeInfo = printerProfile.volume;
            if (!volumeInfo) {
                return true;
            }

            var boundaryInfo = printerProfile.boundaries;
            if (!boundaryInfo) {
                return true;
            }

            var boundaries = {
                minX: boundaryInfo.minX(),
                maxX: boundaryInfo.maxX(),
                minY: boundaryInfo.minY(),
                maxY: boundaryInfo.maxY(),
                minZ: boundaryInfo.minZ(),
                maxZ: boundaryInfo.maxZ()
            };

            if (volumeInfo.origin() == "center") {
                boundaries["maxX"] = volumeInfo.width() / 2;
                boundaries["minX"] = -1 * boundaries["maxX"];
                boundaries["maxY"] = volumeInfo.depth() / 2;
                boundaries["minY"] = -1 * boundaries["maxY"];
            }

            // model not within bounds, we need to prepare a warning
            var warning = "";
            var info = "";
            var title = _.sprintf(gettext("Size check %(mode)s mode failed"), {mode: mode});

            var formatData = {
                profile: boundaries,
                object: printingArea,
                dimensions: dimensions
            };

            // Create grid
            var grid = "<div class='Table-row'><div class='Table-item'>";
            var gridsize_y = 300;
            var gridsize_x = 330;

            grid += _.sprintf("<div class='grid' style='max-width: %(gridsize_x).2fpx; height: %(gridsize_y).2fpx;'>", {gridsize_x: gridsize_x, gridsize_y: gridsize_y});

            // TODO: Out for now, only check massive prints.
            // We can only print half X with sync and mirror mode
            // if (mode == "sync" || mode == "mirror") {
            //     boundaries["maxX"] = volumeInfo.width() / 2;
            //     grid += "<div class='print_area'></div>"
            // }

            var draw = {
                width: (dimensions.width / boundaries.maxX) * gridsize_x,
                depth: (dimensions.depth / boundaries.maxY) * gridsize_y,
                left: (dimensions.width / boundaries.maxX) * (printingArea.minX / 2),
                bottom: (dimensions.depth / boundaries.maxY) * (printingArea.minY / 2)
            };


            grid += _.sprintf("<div class='print_model' style='width: %(draw.width).2fpx; height: %(draw.depth).2fpx; left: %(draw.left).2fpx; bottom: %(draw.bottom).2fpx'></div>",{draw: draw});

            grid += "</div></div></div>";

            // First check if the size is correct for the mode.
            var sizeTable = "";
            if (dimensions["width"] > (boundaries["maxX"] + Math.abs(boundaries["minX"]))) {
                info += gettext("Object exceeds print area in width. ");
                sizeTable += "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Print area width') + "</div><div class='Table-item'>" + gettext('Object width') + "</div></div>";
                sizeTable += _.sprintf("<div class='Table-row'><div class='Table-item'>%(profile.maxX).2f mm</div><div class='Table-item file_failed'>%(dimensions.width).2f mm</div></div>", formatData);
            }
            if (dimensions["depth"] > (boundaries["maxY"] + Math.abs(boundaries["minY"]))) {
                info += gettext("Object exceeds print area in depth.");
                sizeTable += "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Print area depth') + "</div><div class='Table-item'>" + gettext('Object depth') + "</div></div>";
                sizeTable += _.sprintf("<div class='Table-row'><div class='Table-item'>%(profile.maxY).2f mm</div><div class='Table-item file_failed'>%(dimensions.depth).2f mm</div></div>", formatData);
            }
            if (dimensions["height"] > (boundaries["maxZ"] + Math.abs(boundaries["minZ"]))) {
                info += gettext("Object exceeds print area in height.");
                sizeTable += "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Print area height') + "</div><div class='Table-item'>" + gettext('Object height') + "</div></div>";
                sizeTable += _.sprintf("<div class='Table-row'><div class='Table-item'>%(profile.maxZ).2f mm</div><div class='Table-item file_failed'>%(dimensions.height).2f mm</div></div>", formatData);
            }


            // Position check after size check do position check
            // Size check passed so info is still empty string.
            var positionTable = "";
            if(info === "") {

                if (printingArea["minX"] < boundaries["minX"] || printingArea["maxX"] > boundaries["maxX"]) {
                    info += gettext("Object positioned outside print area in width.");
                    positionTable += "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Print area width') + "</div><div class='Table-item'>" + gettext('Object position') + "</div></div>";
                    positionTable += _.sprintf("<div class='Table-row'><div class='Table-item'>0.00 - %(profile.maxX).2f mm</div><div class='Table-item file_failed'>%(object.minX).2f - %(object.maxX).2f mm</div></div>", formatData);
                }
                if (printingArea["minY"] < boundaries["minY"] || printingArea["maxY"] > boundaries["maxY"]) {
                    info += gettext("Object positioned outside print area in depth.");
                    positionTable += "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Print area depth') + "</div><div class='Table-item'>" + gettext('Object position') + "</div></div>";
                    positionTable += _.sprintf("<div class='Table-row'><div class='Table-item'>0.00 - %(profile.maxY).2f mm</div><div class='Table-item file_failed'>%(object.minY).2f - %(object.maxY).2f mm</div></div>", formatData);
                }
                if (printingArea["minZ"] < boundaries["minZ"] || printingArea["maxZ"] > boundaries["maxZ"]) {
                    info += gettext("Object positioned outside print area in heigth.");
                    positionTable += "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Print area height') + "</div><div class='Table-item'>" + gettext('Object position') +"</div></div>";
                    positionTable += _.sprintf("<div class='Table-row'><div class='Table-item'>0.00 - %(profile.maxZ).2f mm</div><div class='Table-item file_failed'>%(object.minZ).2f - %(object.maxZ).2f mm</div></div>", formatData);
                }

            }

            //warn user
            if (info != "") {
                info += gettext("Please fix the dimension of the job or try a different print mode.");
                warning += grid;
                warning += info;
                warning += sizeTable;
                warning += positionTable;
                self.dimensions_warning_title = title;
                self.dimensions_warning_message = warning;
                if (notify) {
                    self.flyout.showWarning(title, warning, false);
                }
                return false;
            } else {
                return true;
            }
        };

        self.showDimensionWarning = function () {
            if (self.isDualPrint()){
                var title = gettext("Dual nozzle print")
                var message = gettext("The job selected uses both nozzles to print, therefore only normal mode is available.");
                self.flyout.showInfo(title, message, false);

            } else {
                self.flyout.showWarning(self.dimensions_warning_title, self.dimensions_warning_message, false);
            }
        };

        self.printerState.printMode.subscribeChanged(function(newValue, oldValue){
            if ((newValue == "sync" || newValue == "mirror") && (oldValue == "normal")) {
                //IntroJS
                self.introView.introInstance.exit();
                self.showSyncMirrorWarning();
            }
        });

        self.showSyncMirrorWarning = function() {
            var title = gettext("Sync or Mirror print");

            var grid = "<div class='Table-row'><div class='Table-item'>";
            var gridsize_y = 300;
            var gridsize_x = 330;

            grid += _.sprintf("<div class='grid' style='max-width: %(gridsize_x).2fpx; height: %(gridsize_y).2fpx;'>", {gridsize_x: gridsize_x, gridsize_y: gridsize_y});

            var draw = {
                width: 165,
                depth: 300,
                left: 0,
                bottom: 0
            };
            grid += _.sprintf("<div class='print_model' style='width: %(draw.width).2fpx; height: %(draw.depth).2fpx; left: %(draw.left).2fpx; bottom: %(draw.bottom).2fpx; background-color: #A9CC3C; border-right: 3px dashed #CC2B14'></div>",{draw: draw});
            grid += "</div></div></div>";

            var info = "<div class='Table-row Table-header'><div class='Table-item'>" + gettext('Info') + "</div></div>";
            info += "<div class='Table-row'><div class='Table-item'>" + gettext('To ensure that a sync or mirror mode succeeds please make sure that the print is sliced on the left side of the build volume using one nozzle.') + "</div></div>";
            var message = "";
            message += grid;
            message += info;
            self.flyout.showWarning(title, message, false);
        };

        self.refreshCurrentFolder = function (data)
        {
            var folder = self.elementByPath(self.currentPath());

            if (folder)
                self.loadChildrenAndBrowse(folder);
            else
                self.browseOrigin(self.currentOrigin());
        }

        self.downloadLink = function (data) {
            if (data["refs"] && data["refs"]["download"]) {
                return data["refs"]["download"];
            } else {
                return false;
            }
        };

        self.lastTimePrinted = function (data) {
            if (data["prints"] && data["prints"]["last"] && data["prints"]["last"]["date"]) {
                return data["prints"]["last"]["date"];
            } else {
                return "-";
            }
        };

        self.getSuccessClass = function (data) {
            if (!data["prints"] || !data["prints"]["last"]) {
                return "file_neutral";
            }
            return data["prints"]["last"]["success"] ? "file_ok" : "file_failed";
        };

        self.getSuccessIcon = function (data) {
            if (!data["prints"] || !data["prints"]["last"]) {
                return "fa-circle-thin";
            }
            return data["prints"]["last"]["success"] ? "fa-check file_ok" : "fa-close file_failed";
        };

        self.templateFor = function (data) {
            if (data.origin == "cloud" && data.path == data.name)
                return "files_template_cloud_root_folder"
            else if (data.origin == "cloud")
                return "files_template_cloud_" + data.type
            else if (data.origin == "usb" && data.type == "machinecode")
                return "files_template_usb_" + data.type;
            else
                return "files_template_" + data.type;
        };

        self.templateForSelect = function (data) {
            return "files_template_select_" + data.type;
        };

        self.getEntryId = function (data) {
            return "gcode_file_" + md5(data["origin"] + ":" + data["name"]);
        };

        self.getEntryIdSelect = function (data) {
            return "gcode_file_select_" + md5(data["origin"] + ":" + data["name"]);
        };

        self.getEntryElement = function (data) {
            var entryId = self.getEntryId(data);
            var entryElements = $("#" + entryId);
            if (entryElements && entryElements[0]) {
                return entryElements[0];
            } else {
                return undefined;
            }
        };

        self.enableRemove = function (data) {
            return self.loginState.isUser() && !_.includes(self.printerState.busyFiles(), data.origin + ":" + data.name);
        };

        self.enableSelect = function (data, printAfterSelect) {
            var isLoadActionPossible = self.loginState.isUser() && self.printerState.isOperational() && !(self.printerState.waitingForCancel() || self.printerState.isPrinting() || self.printerState.isPaused() || self.printerState.isLoading());
            return isLoadActionPossible && !self.listHelper.isSelected(data);
        };

        self.enableAdditionalData = function (data) {
            // TODO: Add anaylsing icon in files additional data.
            return data["gcodeAnalysis"]() || data["prints"] && data["prints"]["last"];
        };

        self.toggleAdditionalData = function (data) {
            var entryElement = self.getEntryElement(data);
            if (!entryElement) return;

            var additionalInfo = $(".file_add_info", entryElement);
            additionalInfo.toggleClass("hide");
            var angleIcon = $(".file_info i", entryElement);
            angleIcon.toggleClass("fa-angle-down fa-angle-up");
        };

        self.refreshPrintPreview = function (filename, url) {
            var file = self.getFileByFilename(filename);

            if(file)
                file.previewUrl(url);
        }

        self.getFileByFilename = function (filename) {
            return self.listHelper.getItem(function (item) {
                if (item.type == "folder") {
                    return _.startsWith(filename, item.path + "/");
                } else {
                    return item.path.toLowerCase() == filename.toLowerCase();
                }
            }, false);
        }

        self.clearQuery = function()
        {
            self.searchQuery(undefined);
        }

        self.performSearch = function (e) {
            var query = self.searchQuery();
            if (query !== undefined && query.trim() != "") {
                query = query.toLocaleLowerCase();

                var recursiveSearch = function (entry) {
                    if (entry === undefined) {
                        return false;
                    }

                    if (entry["type"] == "folder" && entry["children"]) {
                        return _.some(entry["children"], recursiveSearch);
                    } else {
                        return entry["name"].toLocaleLowerCase().indexOf(query) > -1;
                    }
                };

                self.listHelper.changeSearchFunction(recursiveSearch);
            } else {
                self.listHelper.resetSearch();
            }

            return false;
        };


        self.onUserLoggedIn = function (user) {
            self.uploadButton.fileupload("enable");
        };

        self.onUserLoggedOut = function ()  {
            self.uploadButton.fileupload("disable");
        };

        self.onUsbAvailableChanged = function ()  {
            if (!IS_LOCAL)
                return;

            available = self.isUsbAvailable();

            if (!available)
                $.notify({
                    title: gettext("USB drive removed"),
                    text: gettext('A USB drive was disconnected from the printer.')
                }, "success");

            if ($('#files').hasClass('open')) {
                if (!available)
                    self.browseOrigin("local");
                else
                    self.browseOrigin("usb");
            }
            else if (available && (!self.flyout.isOpen() || !self.flyout.blocking)) {
                var text = gettext("You have inserted a USB drive.");
                var question = gettext("Would you like to browse through the files?");
                var title = gettext("USB drive inserted");
                var dialog = { 'title': title, 'text': text, 'question': question };

                self.flyout.showConfirmationFlyout(dialog)
               .done(function ()  {
                   changeTabTo("files");
                   self.browseOrigin("usb");
               });
            }
            else if (available)
            {
                $.notify({
                    title: gettext("USB drive inserted"),
                    text: gettext('A USB drive was found. Go to the files tab to load your files.')
                }, "success");
            }
            else {
                self.browseOrigin("local");
            }
        }

        self.setProgressBar = function (percentage) {
            self.uploadProgressBar
                .css("width", percentage + "%")
        }

        self.onStartup = function () {

            self.cloud.onServiceInfoUpdated(function () {
                if(self.currentOrigin() == "cloud")
                {
                    var current_path = self.currentPath();
                    if(!current_path || current_path == "/")
                    {
                        // If we're on the 'select cloud' page, refresh everything
                        self.browseOrigin("cloud");
                    }
                    else
                    {
                        // Check if we' re currently browsing in a disconnect service
                        // If so, reload the cloud page
                        _.forEach(self.cloud.serviceInfo(), function (service) {
                            if (!service.loggedIn() && current_path.startsWith(service.name()))
                                self.browseOrigin("cloud");
                        });
                    }
                }
            });

            //~~ Gcode upload
            self.uploadButton = $("#gcode_upload");

            var uploadProgress = $("#gcode_upload_progress");
            self.uploadProgressBar = uploadProgress.find(".bg-orange");

            function gcode_upload_done(e, data) {
                var filename = undefined;
                var location = undefined;
                if (data.result.files.hasOwnProperty("sdcard")) {
                    filename = data.result.files.sdcard.name;
                    location = "sdcard";
                } else if (data.result.files.hasOwnProperty("local")) {
                    filename = data.result.files.local.name;
                    location = "local";
                }
                self.requestData(filename, location, self.currentPath());

                if (data.result.done) {
                    self.setProgressBar(0, "", false);
                    $.notify({
                        title: gettext("File upload succesful"),
                        text: _.sprintf(gettext('Uploaded file: "%(filename)s"'), { filename: filename })
                    },
                        "success"
                    );
                    self.loadFile(data.result.files.local, false);
                }
            }

            function gcode_upload_fail(e, data) {
                $.notify({
                    title: gettext("Failed to upload file"),
                    text: _.sprintf(gettext('Could not upload the file. Make sure that it is a GCODE file and has the extension \".gcode\", \".gco\." or \".g\"'))
                },
                    "error"
                );
                self.setProgressBar(0, "", false);
            }

            function gcode_upload_progress(e, data) {
                var progress = parseInt(data.loaded / data.total * 100, 10);
                self.setProgressBar(progress);
            }


            var url = API_BASEURL + "files/local";

            if (self.uploadButton === undefined)
                return;

            self.uploadButton.fileupload({

                add: function (e, data) {
                    var acceptFileTypes = /(\.)(gcode|gco|g)$/i;
                    var dfd = $.Deferred(),
                        file = data.files[0];
                    if (acceptFileTypes.test(file.name)) {
                        data.submit();
                    } else {
                        $.notify({
                            title: gettext("Invalid filetype"),
                            text: _.sprintf(gettext('Please select a file with extension \".gcode\", \".gco\." or \".g\".'), {})
                        },
                        {
                            className: "error",
                            autoHide: false
                        });
                    }
                },
                url: url,
                dataType: "json",
                done: gcode_upload_done,
                fail: gcode_upload_fail,
                progressall: gcode_upload_progress
            }).bind('fileuploadsubmit', function (e, data) {
                if (self.currentPath() != "")
                    data.formData = { path: self.currentPath() };
            });

            self.requestData();
            self.checkUsbMounted();
        };

        self.checkUsbMounted = function ()  {
            getFromApi("usb").done(function (data) {
                self.isUsbAvailable(data.isMediaMounted);
                // Don't call onChanged, as it is the initialization
            });
        }
        self.onEventMetadataAnalysisFinished = function (payload) {

            var file = self.getFileByFilename(payload.path);

            if(file)
                file["gcodeAnalysis"](payload.result);
        };

        self.onEventMetadataStatisticsUpdated = function (payload) {

            var file = self.getFileByFilename(payload.path);

            if (file && file.refs.resource)
            {
                OctoPrint.get(file.refs.resource).done(function (metadata) {
                    file.prints(metadata.prints);
                });
            }
        };

        self.onDataUpdaterPluginMessage = function (plugin, data) {
            var messageType = data['type'];
            var messageData = data['data'];

            if (plugin == "gcoderender") {
                switch (messageType) {
                    case "gcode_preview_rendering":
                        previewItem = self.gcodePreviews.find(function (item) { return item.filename.toLowerCase() == messageData.filename.toLowerCase() });

                        if (previewItem)
                            self.gcodePreviews.pop(previewItem)

                        self.refreshPrintPreview(messageData.filename, undefined);
                    case "gcode_preview_ready":
                        previewItem = self.gcodePreviews.find(function (item) { return item.filename.toLowerCase() == messageData.filename.toLowerCase() });

                        if (previewItem)
                            self.gcodePreviews.pop(previewItem)

                        self.gcodePreviews.push({ filename: messageData.filename, previewUrl: messageData.previewUrl });
                        self.refreshPrintPreview(messageData.filename, messageData.previewUrl);
                        break;
                }
            }
            else if (plugin == "lui") {
                var copying = gettext("Copying");
                switch (messageType) {
                    case "media_folder_updated":
                        self.isUsbAvailable(messageData.isMediaMounted);
                        self.onUsbAvailableChanged();

                        if (messageData.error) {
                            self.notifyUsbFail();
                        }

                        break;
                    case "media_file_copy_progress":
                        self.setProgressBar(messageData.percentage);

                        if (messageData.percentage < 100)
                            self.printerState.activities.push(copying);
                        else
                            self.printerState.activities.remove(copying);

                        break;
                    case "media_file_copy_complete":
                        self.setProgressBar(0);
                        self.printerState.activities.remove(copying);
                        break;
                    case "media_file_copy_failed":
                        self.setProgressBar(0);
                        self.printerState.activities.remove(copying);
                        break;

                    case "gcode_copy_progress":
                        self.setProgressBar(messageData.percentage);

                        if (messageData.percentage < 100)
                            self.printerState.activities.push(copying);
                        else
                            self.printerState.activities.remove(copying);

                        break;

                    case "gcode_copy_complete":
                        self.setProgressBar(0);
                        self.printerState.activities.remove(copying);
                        
                        $.notify({
                            title: gettext("File copied"),
                            text: _.sprintf(gettext('"%(filename)s" has been copied to your USB drive.'), { filename: filename = messageData["filename"] })
                        },
                            "success"
                        );
                        break;
                    case "gcode_copy_failed":
                        self.setProgressBar(0);
                        self.printerState.activities.remove(copying);
                        filename = messageData["filename"];
                        $.notify({
                            title: gettext("Error during file copy."),
                            text: _.sprintf(gettext('Could not copy "%(filename)s" to your USB drive. Please ensure there is enough space available.'), { filename: messageData["filename"] })
                        },
                            "error"
                        );
                        break;
                    case "gcode_copy_all_progress":
                        self.setProgressBar(messageData.percentage);

                        if (messageData.percentage < 100)
                            self.printerState.activities.push(copying);
                        else
                            self.printerState.activities.remove(copying);

                        break;

                    case "gcode_copy_all_complete":
                        self.setProgressBar(0);
                        self.printerState.activities.remove(copying);

                        $.notify({
                            title: gettext("All files copied copied"),
                            text: _.sprintf(gettext('All G-code files have been copied to your USB drive.'))
                        },
                            "success"
                        );
                        break;
                    case "gcode_copy_all_failed":
                        self.setProgressBar(0);
                        self.printerState.activities.remove(copying);
                        $.notify({
                            title: gettext("Error during file copy."),
                            text: _.sprintf(gettext('One or more files failed to copy to your USB drive. Please ensure there is enough space available.'))
                        },
                            "error"
                        );
                        break;
                    case "demo_selected":
                        self.printAndChangeTab();
                        //IntroJS
                        if (self.introView.isTutorialStarted){
                            self.isIntroFile(false);
                            self.introView.introInstance.goToStep(self.introView.getStepNumberByName("selectPrintMode"));
                            self.introView.introInstance.refresh();
                        }
                        break;
                }
            }
        };

        self.checkIntroCancel = function () {
            //IntroJS
            self.introView.introInstance.exit();
            self.flyout.closeFlyout();
        };

        self.selectDemoFile = function () {
            sendToApi("printer/select_demo");
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        FilesViewModel,
        ["settingsViewModel", "loginStateViewModel", "printerStateViewModel", "flyoutViewModel", "printerProfilesViewModel", "filamentViewModel", "networkmanagerViewModel", "cloudViewModel", "navigationViewModel", "introViewModel"],
        ["#files", "#firmware_file_flyout", "#mode_select_flyout"]
    ]);
});
