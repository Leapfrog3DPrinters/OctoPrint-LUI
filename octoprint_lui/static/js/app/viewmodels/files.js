$(function () {
    function GcodeFilesViewModel(parameters) {
        // TODO Fully adapt to LUI
        var self = this;

        self.settingsViewModel = parameters[0];
        self.loginState = parameters[1];
        self.printerState = parameters[2];
        self.flyout = parameters[3];
        self.printerProfiles=parameters[4];
        self.filament = parameters[5];

        //self.slicing = parameters[3];

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);
        self.isSdReady = ko.observable(undefined);

        self.isUsbAvailable = ko.observable(false);
        self.selectedFirmwareFile = ko.observable(undefined);
        self.currentOrigin = ko.observable("local");

        self.selectedFile = ko.observable(undefined);

        self.searchQuery = ko.observable(undefined);
        self.searchQuery.subscribe(function () {
            self.performSearch();
        });

        self.freeSpace = ko.observable(undefined);
        self.totalSpace = ko.observable(undefined);
        self.freeSpaceString = ko.computed(function () {
            if (!self.freeSpace())
                return "-";
            return formatSize(self.freeSpace());
        });
        self.totalSpaceString = ko.computed(function () {
            if (!self.totalSpace())
                return "-";
            return formatSize(self.totalSpace());
        });

        self.diskusageWarning = ko.computed(function () {
            return self.freeSpace() != undefined
                && self.freeSpace() < self.settingsViewModel.server_diskspace_warning();
        });
        self.diskusageCritical = ko.computed(function () {
            return self.freeSpace() != undefined
                && self.freeSpace() < self.settingsViewModel.server_diskspace_critical();
        });
        self.diskusageString = ko.computed(function () {
            if (self.diskusageCritical()) {
                return gettext("Your available free disk space is critically low.");
            } else if (self.diskusageWarning()) {
                return gettext("Your available free disk space is starting to run low.");
            } else {
                return gettext("Your current disk usage.");
            }
        });

        self.uploadButton = undefined;
        self.uploadSdButton = undefined;
        self.uploadProgressBar = undefined;

        self.isLoadingFile = false;
        self.isLoadingFileList = ko.observable(false);

        self.addFolderDialog = undefined;
        self.addFolderName = ko.observable(undefined);
        self.enableAddFolder = ko.computed(function () {
            return self.loginState.isUser() && self.addFolderName() && self.addFolderName().trim() != "";
        });

        self.allItems = ko.observable(undefined);
        self.listStyle = ko.observable("folders_files");
        self.currentPath = ko.observable("");

        self.gcodePreviews = [];

        var preProcessList = function (response) {
            var recursiveCheck = function (element, index, list) {
                if (!element.hasOwnProperty("parent")) element.parent = { children: list, parent: undefined };
                if (!element.hasOwnProperty("size")) element.size = undefined;
                if (!element.hasOwnProperty("date")) element.date = undefined;
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

        self.isOriginLocal = ko.pureComputed(function() {
            return self.currentOrigin() == "local";
        })

        self.browseLocal = function () {
            if (self.isLoadingFileList())
                return;

            self.isLoadingFileList(true);
            var filenameToFocus = undefined;
            selectedFile = self.selectedFile();
            if (selectedFile)
                var filenameToFocus = selectedFile.name;
            var locationToFocus = undefined;
            var switchToPath = '';
            self.loadFiles("local").done(preProcessList).done(function (response) {
                self.fromResponse(response, filenameToFocus, locationToFocus, switchToPath);
                self.currentOrigin("local");
            }).always(function () { 
                self.isLoadingFileList(false);
            });
        }

        self.browseUsb = function () {
            if (self.isLoadingFileList())
                return;

            self.isLoadingFileList(true);
            var filenameToFocus = '';
            var locationToFocus = '';
            var switchToPath = '';
            self.loadFiles("usb")
                .done(preProcessList)
                .fail(self.notifyUsbFail)
                .then(function (response) {
                    self.fromResponse(response, filenameToFocus, locationToFocus, switchToPath);
                    self.currentOrigin("usb");
                }).always(function () { self.isLoadingFileList(false); });
        }

        self.notifyUsbFail = function () {
            $.notify({ title: 'USB access failed', text: 'The USB drive could not be accessed. Please try again.' }, 'error');
        };

        self.browseUsbForFirmware = function () {
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
                }).always(function () { self.isLoadingFileList(false); });
        }

        self.loadFiles = function (origin, filter) {
            filter = filter || "";
            return self._getApi({
                command: "get_files",
                origin: origin,
                filter: filter,
                recursive: true
            });
        }

        self._getApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.get(url, { data: data });
        };

        self._sendApi = function (data) {
            url = OctoPrint.getSimpleApiUrl('lui');
            return OctoPrint.postJson(url, data);
        };

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
                "printed": function (data) {
                    return !(data["prints"] && data["prints"]["success"] && data["prints"]["success"] > 0) || (data["type"] && data["type"] == "folder");
                },
                "sd": function (data) {
                    return data["origin"] && data["origin"] == "sdcard";
                },
                "local": function (data) {
                    return !(data["origin"] && data["origin"] == "sdcard");
                },
                "machinecode": function (data) {
                    return data["type"] && (data["type"] == "machinecode" || data["type"] == "folder");
                },
                "model": function (data) {
                    return data["type"] && (data["type"] == "model" || data["type"] == "folder");
                },
                "emptyFolder": function (data) {
                    return data["type"] && (data["type"] != "folder" || data["children"].length != 0);
                }
            },
            "name",
            ["emptyFolder"],
            [["sd", "local"], ["machinecode", "model"]],
            0
        );

        self.foldersOnlyList = ko.dependentObservable(function () {
            var filter = function (data) { return data["type"] && data["type"] == "folder"; };
            return _.filter(self.listHelper.paginatedItems(), filter);
        });

        self.filesOnlyList = ko.dependentObservable(function () {
            var filter = function (data) { return data["type"] && data["type"] != "folder"; };
            return _.filter(self.listHelper.paginatedItems(), filter);
        });

        self.filesAndFolders = ko.dependentObservable(function () {
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

        self.isLoadActionPossible = ko.computed(function () {
            return self.loginState.isUser() && !self.isPrinting() && !self.isPaused() && !self.isLoading();
        });

        self.isLoadAndPrintActionPossible = ko.computed(function () {
            return self.loginState.isUser() && self.isOperational() && self.isLoadActionPossible();
        });

        self.printerState.filename.subscribe(function (newValue) {
            self.highlightFilename(newValue);
        });


        self.listHelper.selectedItem.subscribe(function(newValue) {
            self.selectedFile(newValue);
        });

        self.highlightCurrentFilename = function() {
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
            self.isSdReady(data.flags.sdReady);
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
                    }).always(function () {
                        self.requestDataBase(filenameToFocus, locationToFocus, switchToPath)
                    });

            }
            else
            {
                self.requestDataBase(filenameToFocus, locationToFocus, switchToPath)
            }
            
        };

        self.requestDataBase = function (filenameToFocus, locationToFocus, switchToPath)
        {
            self._otherRequestInProgress = true;
            OctoPrint.files.list({ data: { recursive: true } }).done(preProcessList)
                .done(function (response) {
                    self.fromResponse(response, filenameToFocus, locationToFocus, switchToPath);
                })
                .always(function () {
                    self._otherRequestInProgress = false;
                });
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

            if (filenameToFocus) {
                // got a file to scroll to
                if (locationToFocus === undefined) {
                    locationToFocus = "local";
                }
                var entryElement = self.getEntryElement({ name: filenameToFocus, origin: locationToFocus });
                if (entryElement) {
                    var entryOffset = $(entryElement).position().top;
                    console.log("Entry offset: " + entryOffset);
                    $(".gcode_files").slimScroll({ scrollTo: entryOffset + "px" });//TODO
                }
            }

            if (response.free != undefined) {
                self.freeSpace(response.free);
            }

            if (response.total != undefined) {
                self.totalSpace(response.total);
            }

            self.highlightCurrentFilename();
        };

        self.changeFolder = function (data) {
            self.currentPath(data.path);
            self.listHelper.updateItems(data.children);
            self.highlightCurrentFilename();
        };

        self.navigateUp = function () {
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

        self.showAddFolderDialog = function () {
            if (self.addFolderDialog) {
                self.addFolderDialog.modal("show");
            }
        };

        self.addFolder = function () {
            var name = self.addFolderName();

            // "local" only for now since we only support local and sdcard,
            // and sdcard doesn't support creating folders...
            OctoPrint.files.createFolder("local", name, self.currentPath())
                .done(function () {
                    self.addFolderDialog.modal("hide");
                });
        };

        self.loadFile = function (file, printAfterLoad) {
            if (!file || self.isLoadingFile) {
                return;
            }

            self.isLoadingFile = true;

            if (file.type == "firmware") {
                //Check if we're living in a flyout
                if (self.flyout.deferred !== undefined) {
                    self.selectedFirmwareFile(file);
                    self.flyout.closeFlyoutAccept();
                }

                self.isLoadingFile = false;
            }
            else if (file.origin == "usb") {
                self._sendApi({ command: "select_usb_file", filename: file.path }).done(function () {
                    self.setProgressBar(0);

                    if (printAfterLoad) {
                        OctoPrint.job.start();
                    }

                    if (self.flyout.deferred)
                        self.flyout.closeFlyoutAccept();

                })
                .always(function () { self.isLoadingFile = false; })
                .done(function () {
                    self.browseLocal();
                });
            }
            else {
                OctoPrint.files.select(file.origin, file.path)
                        .done(function () {
                            if (printAfterLoad) {
                                self.printerState.print();
                            }
                            if (self.flyout.deferred)
                                self.flyout.closeFlyoutAccept();
                            // changeTabTo("print");
                        }).always(function () { self.isLoadingFile = false; });;
            }

        };

        self.printAndChangeTab = function() {
            changeTabTo("print");
            self.printerState.print();
        }

        self.copyToUsb = function(file)
        {
            if (!file) {
                return;
            }

            self._sendApi({ command: "copy_gcode_to_usb", filename: file.name });
        }

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

            var text = "You have opted to delete job: " + file.name;
            var question = "Do you want to delete this job?";
            var title = "Delete job"
            var dialog = { 'title': title, 'text': text, 'question': question };

            self.flyout.showConfirmationFlyout(dialog)
            .done(function() {        
                OctoPrint.files.delete(file.origin, file.path)
                    .done(function() {
                        self.requestData(undefined, filenameToFocus, (file.parent ? file.parent.path : ""));
                        $.notify({
                            title: gettext("File removed succesfully"),
                            text: _.sprintf(gettext('Removed file: "%(filename)s"'), {filename: file.name})},
                            "success"
                        )
                    })
            });
        };

        self.startPrint = function() {
            var mode = self.printerState.printMode();
            var file = self.selectedFile();

            var withinPrintDimensions = self.evaluatePrintDimensions(file, mode, true);

            if (withinPrintDimensions) {
                self._sendApi({
                    command: "start_print",
                    mode: mode
                })
                self.flyout.closeFlyoutAccept();
            }


            // do print stuff
            // close flyout. 
        };

        self.isDualPrint = ko.computed(function(){
            // Checks if selected file uses both tools for printing.
            // At the moment tools is hardcoded, should be taken from 
            // printer profile. 
            // There is a length check in there, because the analyser 
            // sometimes falsely puts some extrusion on one of the tools 
            // at start up script (or something)
            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                var analysis = self.selectedFile()["gcodeAnalysis"];
                if (!analysis) {
                    return false;
                }
                var filamentInfo = self.selectedFile()['gcodeAnalysis']['filament'];
                var requiredTools = ["tool0", "tool1"];
                var lengthThreshold = 100;

                if (requiredTools.every(function(t) { return t in filamentInfo})) {
                    return(_.every(filamentInfo, function(t){ return t['length'] > lengthThreshold}));
                } else {
                    return false;
                }

            }
        });

        self.isWithinPrintDimensionsSyncMirrorMode = ko.computed(function() {
            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                return self.evaluatePrintDimensions(self.selectedFile(), "sync", false);
            }
        });

        self.isWithinPrintDimensions = ko.computed(function() {
            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local"){
                return self.evaluatePrintDimensions(self.selectedFile(), "normal", false);
             }
        });

        self.enoughFilament = ko.computed(function() {
            if (self.selectedFile() != undefined && self.selectedFile()['origin'] == "local" && self.filament.filaments().length > 0){
                var analysis = data["gcodeAnalysis"];
                if (!analysis) {
                    return false;
                }
                var printFilament = analysis['filament'];
                var loadedFilament = self.filament.filaments();
                var mode = self.printerState.printMode();
                var lengthThreshold = 100;

                if (mode == "normal") {
                    _.every(printFilament, function(tool, key){
                        var toolNum = key.slice(-1);
                        return (tool['length'] - lengthThreshold) < loadedFilament[toolNum].amount();
                    });
                } else if (mode == "sync" || mode == "mirror") {
                    var maxLength = 0.0;
                    _.each(printFilament, function(x){ maxLength < x.length ? maxLength = x.length : maxLength = maxLength});
                    // console.log(maxLength);
                }
                // console.log(printFilament);
                // console.log(loadedFilament);
            }
        });

        self.evaluatePrintDimensions = function(data, mode, notify) {
            if (!self.settingsViewModel.feature_modelSizeDetection()) {
                return true;
            }

            var analysis = data["gcodeAnalysis"];
            if (!analysis) {
                return false;
            }

            var printingArea = data["gcodeAnalysis"]["printingArea"];
            if (!printingArea) {
                return true;
            }

            var dimensions = data["gcodeAnalysis"]["dimensions"];
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

            // set print volume boundaries
            var boundaries = {
                minX : 0,
                maxX : volumeInfo.width(),
                minY : 0,
                maxY : volumeInfo.depth(),
                minZ : 0,
                maxZ : volumeInfo.height()
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
            grid += _.sprintf(gettext("<div class='grid' style='max-width: %(profile.maxX).2fpx; height: %(profile.maxY).2fpx;'>"), formatData);

            // We can only print half X with sync and mirror mode
            if (mode == "sync" || mode == "mirror") {
                boundaries["maxX"] = volumeInfo.width() / 2;
                grid += "<div class='print_area'></div>"
            }

            grid += _.sprintf(gettext("<div class='print_model' style='width: %(dimensions.width).2fpx; height: %(dimensions.depth).2fpx; left: %(object.minX).2fpx; bottom: %(object.minY).2fpx'></div>"),formatData);

            grid += "</div></div></div>";

            // First check if the size is correct for the mode.
            var sizeTable = "";
            if (dimensions["width"] > boundaries["maxX"]) {
                info += "Object exceeds print area in width. ";
                sizeTable += "<div class='Table-row Table-header'><div class='Table-item'>Print area width</div><div class='Table-item'>Object width</div></div>";
                sizeTable += _.sprintf(gettext("<div class='Table-row'><div class='Table-item'>%(profile.maxX).2f mm</div><div class='Table-item file_failed'>%(dimensions.width).2f mm</div></div>"), formatData);  
            }
            if (dimensions["depth"] > boundaries["maxY"]) {
                info += gettext("Object exceeds print area in depth.");
                sizeTable += "<div class='Table-row Table-header'><div class='Table-item'>Print area depth</div><div class='Table-item'>Object depth</div></div>";
                sizeTable += _.sprintf(gettext("<div class='Table-row'><div class='Table-item'>%(profile.maxy).2f mm</div><div class='Table-item file_failed'>%(dimensions.depth).2f mm</div></div>"), formatData);
            }
            if (dimensions["height"] > boundaries["maxZ"]) {
                info += gettext("Object exceeds print area in height.");
                sizeTable += "<div class='Table-row Table-header'><div class='Table-item'>Print area height</div><div class='Table-item'>Object height</div></div>";
                sizeTable += _.sprintf(gettext("<div class='Table-row'><div class='Table-item'>%(profile.maxZ).2f mm</div><div class='Table-item file_failed'>%(dimensions.height).2f mm</div></div>"), formatData);
            }


            // Position check after size check do position check
            // Size check passed so info is still empty string.
            var positionTable = "";
            if(info === "") {

                if (printingArea["minX"] < boundaries["minX"] || printingArea["maxX"] > boundaries["maxX"]) {
                    info += gettext("Object positioned outside print area in width.");
                    positionTable += "<div class='Table-row Table-header'><div class='Table-item'>Print area width</div><div class='Table-item'>Object position</div></div>";
                    positionTable += _.sprintf(gettext("<div class='Table-row'><div class='Table-item'>%(profile.minX).2f - %(profile.maxX).2f mm</div><div class='Table-item file_failed'>%(object.minX).2f - %(object.maxX).2f mm</div></div>"), formatData);  
                }
                if (printingArea["minY"] < boundaries["minY"] || printingArea["maxY"] > boundaries["maxY"]) {
                    info += gettext("Object positioned outside print area in depth.");
                    positionTable += "<div class='Table-row Table-header'><div class='Table-item'>Print area depth</div><div class='Table-item'>Object position</div></div>";
                    positionTable += _.sprintf(gettext("<div class='Table-row'><div class='Table-item'>%(profile.minY).2f - %(profile.maxY).2f mm</div><div class='Table-item file_failed'>%(object.minY).2f - %(object.maxY).2f mm</div></div>"), formatData);  
                }
                if (printingArea["minZ"] < boundaries["minZ"] || printingArea["maxZ"] > boundaries["maxZ"]) {
                    info += gettext("Object positioned outside print area in heigth.");
                    positionTable += "<div class='Table-row Table-header'><div class='Table-item'>Print area height</div><div class='Table-item'>Object position</div></div>";
                    positionTable += _.sprintf(gettext("<div class='Table-row'><div class='Table-item'>%(profile.minZ).2f - %(profile.maxZ).2f mm</div><div class='Table-item file_failed'>%(object.minZ).2f - %(object.maxZ).2f mm</div></div>"), formatData);  
                }
                
            }

            //warn user
            if (info != "") {
                if (notify) {
                    info += "Please fix the dimension of the job or try a different print mode."
                    warning += grid;
                    warning += info;
                    warning += sizeTable;
                    warning += positionTable;
                    self.flyout.showWarning(title, warning, false);

                }
                return false;
            } else {
                return true;
            }
        };

        self.sliceFile = function(file) {
            if (!file) {
                return;
            }
            self.slicing.show(file.origin, file.path, true);
        };

        self.initSdCard = function () {
            OctoPrint.printer.initSd();
        };

        self.releaseSdCard = function () {
            OctoPrint.printer.releaseSd();
        };

        self.refreshSdFiles = function () {
            OctoPrint.printer.refreshSd();
        };

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
            if (data.origin == "usb" && data.type == "machinecode")
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
            return self.loginState.isUser() && !_.contains(self.printerState.busyFiles(), data.origin + ":" + data.name);
        };

        self.enableSelect = function (data, printAfterSelect) {
            var isLoadActionPossible = self.loginState.isUser() && self.isOperational() && !(self.isPrinting() || self.isPaused() || self.isLoading());
            return isLoadActionPossible && !self.listHelper.isSelected(data);
        };

        self.enableSlicing = function (data) {
            return self.loginState.isUser() && self.slicing.enableSlicingDialog();
        };

        self.enableAdditionalData = function (data) {
            return data["gcodeAnalysis"] || data["prints"] && data["prints"]["last"];
        };

        self.toggleAdditionalData = function (data) {
            var entryElement = self.getEntryElement(data);
            if (!entryElement) return;

            var additionalInfo = $(".file_add_info", entryElement);
            additionalInfo.toggleClass("hide");
            var angleIcon = $(".file_info i", entryElement);
            angleIcon.toggleClass("fa-angle-down fa-angle-up");
        };

        self.getAdditionalData = function (data) {
            var output = "";
            if (data["gcodeAnalysis"]) {
                if (data["gcodeAnalysis"]["filament"] && typeof (data["gcodeAnalysis"]["filament"]) == "object") {
                    var filament = data["gcodeAnalysis"]["filament"];
                    if (_.keys(filament).length == 1) {
                        output += "<strong>" + gettext("Filament") + ":</strong><br/>" + formatFilament(data["gcodeAnalysis"]["filament"]["tool" + 0]) + "<br>";
                    } else if (_.keys(filament).length > 1) {
                        for (var toolKey in filament) {
                            if (!_.startsWith(toolKey, "tool") || !filament[toolKey] || !filament[toolKey].hasOwnProperty("length") || filament[toolKey]["length"] <= 0) continue;

                            output += "<strong>" + gettext("Filament ") + "</strong> (" + (toolKey == 'tool0' ? 'Right' : 'Left') + "):<br/>" + formatFilament(filament[toolKey]) + "<br>";
                        }
                    }
                }
                output += "<strong>" + gettext("Est. Print Time") + ":</strong><br/>" + formatDuration(data["gcodeAnalysis"]["estimatedPrintTime"]) + "<br>";
            }
            if (data["prints"] && data["prints"]["last"]) {
                output += "<strong>" + gettext("Last Printed") + ":</strong><br/>" + formatTimeAgo(data["prints"]["last"]["date"]) + "<br>";
                if (data["prints"]["last"]["lastPrintTime"]) {
                    output += "<strong>">gettext("Last Print Time") + ":</strong><br/>" + formatDuration(data["prints"]["last"]["lastPrintTime"]);
                }
            }
            return output;
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
                        return _.any(entry["children"], recursiveSearch);
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

        self.onDataUpdaterReconnect = function () {
            self.requestData(undefined, undefined, self.currentPath());
        };

        self.onServerConnect = self.onServerReconnect = function(payload) {
            self.requestData();
        };

        self.onUserLoggedIn = function (user) {
            self.uploadButton.fileupload("enable");
            if (self.uploadSdButton) {
                self.uploadSdButton.fileupload("enable");
            }
        };

        self.onUserLoggedOut = function () {
            self.uploadButton.fileupload("disable");
            if (self.uploadSdButton) {
                self.uploadSdButton.fileupload("disable");
            }
        };

        self.onUsbAvailableChanged = function () {
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
                    self.browseLocal();
                else
                    self.browseUsb();
            }
            else if (available && (!self.flyout.isOpen() || !self.flyout.blocking)) {
                var text = "You have inserted a USB drive.";
                var question = "Would you like to browse through the files?";
                var title = "USB drive inserted"
                var dialog = { 'title': title, 'text': text, 'question': question };

                self.flyout.showConfirmationFlyout(dialog)
               .done(function () {
                   changeTabTo("files");
                   self.browseUsb();
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
                self.browseLocal();
            }
        }

        self.setProgressBar = function (percentage) {
            self.uploadProgressBar
                .css("width", percentage + "%")
        }

        self.onStartup = function () {
            $(".accordion-toggle[data-target='#files']").click(function () {
                var files = $("#files");
                if (files.hasClass("in")) {
                    files.removeClass("overflow_visible");
                } else {
                    setTimeout(function () {
                        files.addClass("overflow_visible");
                    }, 100);
                }
            });

            // $(".gcode_files").slimScroll({
            //     height: "306px",
            //     size: "5px",
            //     distance: "0",
            //     railVisible: true,
            //     alwaysVisible: true,
            //     scrollBy: "102px"
            // });

            self.addFolderDialog = $("#add_folder_dialog");

            //~~ Gcode upload

            self.uploadButton = $("#gcode_upload");
            self.uploadSdButton = $("#gcode_upload_sd");
            if (!self.uploadSdButton.length) {
                self.uploadSdButton = undefined;
            }

            var uploadProgress = $("#gcode_upload_progress");
            self.uploadProgressBar = uploadProgress.find(".bg-orange");

            var localTarget = CONFIG_SD_SUPPORT ? $("#drop_locally") : $("#drop");
            var sdTarget = $("#drop_sd");

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

                if (_.endsWith(filename.toLowerCase(), ".stl")) {
                    self.slicing.show(location, filename);
                }

                if (data.result.done) {
                    self.setProgressBar(0, "", false);
                    $.notify({
                        title: gettext("File upload succesfull"),
                        text: _.sprintf(gettext('Uploaded file: "%(filename)s"'), { filename: filename })
                    },
                        "success"
                    )
                }
            }

            function gcode_upload_fail(e, data) {
                $.notify({
                    title: gettext("Failed to upload file"),
                    text: _.sprintf(gettext('Could not upload the file. Make sure that it is a GCODE file and has the extension \".gcode\" or \".gco\" or that it is an STL file with the extension \".stl\"."'))
                },
                    "error"
                )
                self.setProgressBar(0, "", false);
            }

            function gcode_upload_progress(e, data) {
                var progress = parseInt(data.loaded / data.total * 100, 10);
                self.setProgressBar(progress);
            }

            function setDropzone(dropzone, enable) {
                var button = (dropzone == "local") ? self.uploadButton : self.uploadSdButton;
                var drop = (dropzone == "local") ? localTarget : sdTarget;
                var url = API_BASEURL + "files/" + dropzone;

                if (button === undefined)
                    return;

                button.fileupload({
                    url: url,
                    dataType: "json",
                    dropZone: enable ? drop : null,
                    drop: function (e, data) {

                    },
                    done: gcode_upload_done,
                    fail: gcode_upload_fail,
                    progressall: gcode_upload_progress
                }).bind('fileuploadsubmit', function (e, data) {
                    if (self.currentPath() != "")
                        data.formData = { path: self.currentPath() };
                });
            }

            function evaluateDropzones() {
                var enableLocal = self.loginState.isUser();
                var enableSd = enableLocal && CONFIG_SD_SUPPORT && self.printerState.isSdReady();

                setDropzone("local", enableLocal);
                setDropzone("sdcard", enableSd);
            }
            self.loginState.isUser.subscribe(evaluateDropzones);
            self.printerState.isSdReady.subscribe(evaluateDropzones);
            evaluateDropzones();

            $(document).bind("dragover", function (e) {
                var dropOverlay = $("#drop_overlay");
                var dropZone = $("#drop");
                var dropZoneLocal = $("#drop_locally");
                var dropZoneSd = $("#drop_sd");
                var dropZoneBackground = $("#drop_background");
                var dropZoneLocalBackground = $("#drop_locally_background");
                var dropZoneSdBackground = $("#drop_sd_background");
                var timeout = window.dropZoneTimeout;

                if (!timeout) {
                    dropOverlay.addClass("in");
                } else {
                    clearTimeout(timeout);
                }

                var foundLocal = false;
                var foundSd = false;
                var found = false;
                var node = e.target;
                do {
                    if (dropZoneLocal && node === dropZoneLocal[0]) {
                        foundLocal = true;
                        break;
                    } else if (dropZoneSd && node === dropZoneSd[0]) {
                        foundSd = true;
                        break;
                    } else if (dropZone && node === dropZone[0]) {
                        found = true;
                        break;
                    }
                    node = node.parentNode;
                } while (node != null);

                if (foundLocal) {
                    dropZoneLocalBackground.addClass("hover");
                    dropZoneSdBackground.removeClass("hover");
                } else if (foundSd && self.printerState.isSdReady()) {
                    dropZoneSdBackground.addClass("hover");
                    dropZoneLocalBackground.removeClass("hover");
                } else if (found) {
                    dropZoneBackground.addClass("hover");
                } else {
                    if (dropZoneLocalBackground) dropZoneLocalBackground.removeClass("hover");
                    if (dropZoneSdBackground) dropZoneSdBackground.removeClass("hover");
                    if (dropZoneBackground) dropZoneBackground.removeClass("hover");
                }

                window.dropZoneTimeout = setTimeout(function () {
                    window.dropZoneTimeout = null;
                    dropOverlay.removeClass("in");
                    if (dropZoneLocal) dropZoneLocalBackground.removeClass("hover");
                    if (dropZoneSd) dropZoneSdBackground.removeClass("hover");
                    if (dropZone) dropZoneBackground.removeClass("hover");
                }, 100);
            });

            self.requestData();
            self.checkUsbMounted();
        };

        self.checkUsbMounted = function () {
            self._getApi({ "command": "is_media_mounted" }).done(function (data) {
                self.isUsbAvailable(data.is_media_mounted);
                // Don't call onChanged, as it is the initialization
            });
        }

        self.onEventUpdatedFiles = function (payload) {
            //TODO: Fix for USB
            if (payload.type == "gcode") {
                self.requestData(undefined, undefined, self.currentPath());
            }
        };

        self.onEventSlicingDone = function (payload) {
            self.requestData(undefined, undefined, self.currentPath());
        };

        self.onEventMetadataAnalysisStarted = function (payload) {
        };

        self.onEventMetadataAnalysisFinished = function (payload) {
            self.requestData(undefined, undefined, self.currentPath());
        };

        self.onEventMetadataStatisticsUpdated = function (payload) {
            self.requestData(undefined, undefined, self.currentPath());
        };

        self.onEventTransferDone = function (payload) {
            self.requestData(payload.remote, "sdcard");
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
                switch (messageType) {
                    case "media_folder_updated":
                        self.isUsbAvailable(messageData.is_media_mounted);
                        self.onUsbAvailableChanged();

                        if (messageData.error) {
                            self.notifyUsbFail();
                        }

                        break;
                    case "media_file_copy_progress":
                        self.setProgressBar(messageData.percentage);

                        if (messageData.percentage < 100)
                            self.printerState.activities.push('Copying');
                        else
                            self.printerState.activities.remove('Copying');

                        break;
                    case "media_file_copy_complete":
                        self.setProgressBar(0);
                        self.printerState.activities.remove('Copying');
                        break;
                    case "media_file_copy_failed":
                        self.setProgressBar(0);
                        self.printerState.activities.remove('Copying');
                        break;

                    case "gcode_copy_progress":
                        self.setProgressBar(messageData.percentage);

                        if (messageData.percentage < 100)
                            self.printerState.activities.push('Copying');
                        else
                            self.printerState.activities.remove('Copying');

                        break;

                    case "gcode_copy_complete":
                        self.setProgressBar(0);
                        self.printerState.activities.remove('Copying');
                        break;
                    case "gcode_copy_failed":
                        self.setProgressBar(0);
                        self.printerState.activities.remove('Copying');
                        break;

                }
            }
        }
    }

    OCTOPRINT_VIEWMODELS.push([
        GcodeFilesViewModel,
        ["settingsViewModel", "loginStateViewModel", "printerStateViewModel", "flyoutViewModel", "printerProfilesViewModel", "filamentViewModel"],
        ["#files", "#firmware_file_flyout", "#mode_select_flyout"]
    ]);
});
