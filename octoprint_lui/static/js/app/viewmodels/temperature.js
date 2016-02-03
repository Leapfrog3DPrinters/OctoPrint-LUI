$(function() {
    function TemperatureViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settingsViewModel = parameters[1];

        self._createToolEntry = function() {
            return {
                name: ko.observable(),
                key: ko.observable(),
                actual: ko.observable(0),
                target: ko.observable(0),
                offset: ko.observable(0),
                newTarget: ko.observable(),
                newOffset: ko.observable()
            }
        };

        self.tools = ko.observableArray([]);
        self.hasBed = ko.observable(true);
        self.bedTemp = self._createToolEntry();
        self.bedTemp["name"](gettext("Bed"));
        self.bedTemp["key"]("bed");

        self.isErrorOrClosed = ko.observable(undefined);
        self.isOperational = ko.observable(undefined);
        self.isPrinting = ko.observable(undefined);
        self.isPaused = ko.observable(undefined);
        self.isError = ko.observable(undefined);
        self.isReady = ko.observable(undefined);
        self.isLoading = ko.observable(undefined);

        self.temperature_profiles = self.settingsViewModel.temperature_profiles;
        self.temperature_cutoff = self.settingsViewModel.temperature_cutoff;

        self.heaterOptions = ko.observable({});
        self.toolStatus = ko.observableArray([
            {status: ko.observable(),
            text: ko.observable(),
            color: ko.observable()
            },
            {status: ko.observable(),
            text: ko.observable(),
            color: ko.observable()
            },
            {status: ko.observable(),
            text: ko.observable(),
            color: ko.observable()
            }
            ]);
        self.tempLoaded = ko.observable(false);

        self.toolProgress = ko.observableArray([]);

        self.rightProgress = ko.observable(undefined);
        self.leftProgress = ko.observable(undefined);
        self.bedProgress = ko.observable(undefined);

        self.rightStatusString = ko.observable(undefined);
        self.leftStatusString = ko.observable(undefined);
        self.bedStatusString = ko.observable(undefined);


        self.loadingText = ko.computed(function() {
            if (self.tempLoaded()) 
                return gettext("");
            else 
                return gettext("Loading...");
        });

        self._printerProfileUpdated = function() {
            var graphColors = ["red", "orange", "green", "brown", "purple"];
            var heaterOptions = {};
            var tools = self.tools();

            // tools
            var numExtruders = self.settingsViewModel.printerProfiles.currentProfileData().extruder.count();
            if (numExtruders && numExtruders > 1) {
                // multiple extruders
                for (var extruder = 0; extruder < numExtruders; extruder++) {
                    var color = graphColors.shift();
                    if (!color) color = "black";
                    heaterOptions["tool" + extruder] = {name: "T" + extruder, color: color};

                    if (tools.length <= extruder || !tools[extruder]) {
                        tools[extruder] = self._createToolEntry();
                    }
                    tools[extruder]["name"](gettext("Tool") + " " + extruder);
                    tools[extruder]["key"]("tool" + extruder);
                }
            } else {
                // only one extruder, no need to add numbers
                var color = graphColors[0];
                heaterOptions["tool0"] = {name: "T", color: color};

                if (tools.length < 1 || !tools[0]) {
                    tools[0] = self._createToolEntry();
                }
                tools[0]["name"](gettext("Hotend"));
                tools[0]["key"]("tool0");
            }

            // print bed
            if (self.settingsViewModel.printerProfiles.currentProfileData().heatedBed()) {
                self.hasBed(true);
                heaterOptions["bed"] = {name: gettext("Bed"), color: "blue"};
            } else {
                self.hasBed(false);
            }

            // write back
            self.heaterOptions(heaterOptions);
            self.tools(tools);
        };
        self.settingsViewModel.printerProfiles.currentProfileData.subscribe(function() {
            self._printerProfileUpdated();
            self.settingsViewModel.printerProfiles.currentProfileData().extruder.count.subscribe(self._printerProfileUpdated);
            self.settingsViewModel.printerProfiles.currentProfileData().heatedBed.subscribe(self._printerProfileUpdated());
        });

        self.temperatures = [];

        self.fromCurrentData = function(data) {
            self._processStateData(data.state);
            self._processTemperatureUpdateData(data.serverTime, data.temps);
            self._processOffsetData(data.offsets);
        };

        self.fromHistoryData = function(data) {
            self._processStateData(data.state);
            self._processTemperatureHistoryData(data.serverTime, data.temps);
            self._processOffsetData(data.offsets);
        };

        self._processStateData = function(data) {
            self.isErrorOrClosed(data.flags.closedOrError);
            self.isOperational(data.flags.operational);
            self.isPaused(data.flags.paused);
            self.isPrinting(data.flags.printing);
            self.isError(data.flags.error);
            self.isReady(data.flags.ready);
            self.isLoading(data.flags.loading);
        };

        self._processTemperatureUpdateData = function(serverTime, data) {
            if (data.length == 0)
                return;

            var lastData = data[data.length - 1];

            var tools = self.tools();
            for (var i = 0; i < tools.length; i++) {
                if (lastData.hasOwnProperty("tool" + i)) {
                    tools[i]["actual"](lastData["tool" + i].actual);
                    tools[i]["target"](lastData["tool" + i].target);
                }
            }

            if (lastData.hasOwnProperty("bed")) {
                self.bedTemp["actual"](lastData.bed.actual);
                self.bedTemp["target"](lastData.bed.target);
            }

            self.temperatures = self._processTemperatureData(serverTime, data, self.temperatures);
            //self.updatePlot();
            self.setToolStatus();
            self.tempLoaded(true);
        };

        self._processTemperatureHistoryData = function(serverTime, data) {
            self.temperatures = self._processTemperatureData(serverTime, data);
            //updatePlot
            self.setToolStatus();
        };

        self._processOffsetData = function(data) {
            var tools = self.tools();
            for (var i = 0; i < tools.length; i++) {
                if (data.hasOwnProperty("tool" + i)) {
                    tools[i]["offset"](data["tool" + i]);
                }
            }

            if (data.hasOwnProperty("bed")) {
                self.bedTemp["offset"](data["bed"]);
            }
        };

        self._processTemperatureData = function(serverTime, data, result) {
            var types = _.keys(self.heaterOptions());
            var clientTime = Date.now();

            // make sure result is properly initialized
            if (!result) {
                result = {};
            }

            _.each(types, function(type) {
                if (!result.hasOwnProperty(type)) {
                    result[type] = {actual: [], target: []};
                }
                if (!result[type].hasOwnProperty("actual")) result[type]["actual"] = [];
                if (!result[type].hasOwnProperty("target")) result[type]["target"] = [];
            });

            // convert data
            _.each(data, function(d) {
                var timeDiff = (serverTime - d.time) * 1000;
                var time = clientTime - timeDiff;
                _.each(types, function(type) {
                    if (!d[type]) return;
                    result[type].actual.push([time, d[type].actual]);
                    result[type].target.push([time, d[type].target]);
                })
            });

            var filterOld = function(item) {
                return item[0] >= clientTime - self.temperature_cutoff() * 60 * 1000;
            };

            _.each(_.keys(self.heaterOptions()), function(d) {
                result[d].actual = _.filter(result[d].actual, filterOld);
                result[d].target = _.filter(result[d].target, filterOld);
            });

            return result;
        };

        self.setStatus = function (toolStatus, status) {
            switch (status) {
                case 'COOLING':
                    toolStatus.status = "COOLING";
                    toolStatus.text = "Cooling...";
                    toolStatus.color = "bg-yellow";
                    return toolStatus;
                case 'HEATING':
                    toolStatus.status = "HEATING";
                    toolStatus.text = "Heating...";
                    toolStatus.color = "bg-orange";
                    return toolStatus;
                case 'READY':
                    toolStatus.status = "READY";
                    toolStatus.text = "";
                    toolStatus.color = "bg-green";    
                    return toolStatus;
                case 'IDLE':
                    toolStatus.status = "IDLE";
                    toolStatus.text = "";
                    toolStatus.color = "bg-main";    
                    return toolStatus;
                default:
                    return toolStatus;
            }
        };

        self.isToolCooling = function (actual, target) {
            if (actual > 50 && target === 0) 
                return true
        };

        self.isToolHeating = function (actual, target) {
            if (actual < target - 2 && target > 40)
                return true
        }

        self.isToolReady = function(actual, target) {
            if(Math.abs(actual - target) < 3 && target > 40)
                 return true
        };

        self.isToolSwapReady = function (actual, target) {
            if (target - actual < 3)
                return true
        };

        self.heatingProgress = function(actual, target) {
            if (target === 0) 
                target = 200
            return ((actual / target) * 100).toFixed(2);
        }

        self.returnToolTemperature = function(tool, type) {
            if (tool < self.tools().length) 
                return self.tools()[tool][type]();
            return self.bedTemp[type]();
        }

        self.setToolStatus = function() {
            var tools = self.tools();
            var toolStatus = self.toolStatus();

            for (var i = 0; i < tools.length + 1; i++) {
                var actual = self.returnToolTemperature(i, "actual");
                var target = self.returnToolTemperature(i, "target");

                if (self.isToolCooling(actual, target) ) {
                    toolStatus[i] = self.setStatus(toolStatus[i], 'COOLING');
                }
                else if ( self.isToolHeating(actual, target) ) {
                    toolStatus[i] = self.setStatus(toolStatus[i], 'HEATING');
                }
                else if (self.isToolReady(actual, target) ) {
                    toolStatus[i] = self.setStatus(toolStatus[i], 'READY');
                }
                else {
                    toolStatus[i] = self.setStatus(toolStatus[i], 'IDLE');
                }
                self.toolProgress()[i] = (self.heatingProgress(actual, target));

            }
            self.toolStatus(toolStatus);
        };


        self.getMaxTemp = function(actuals, targets) {
            var pair;
            var maxTemp = 0;
            actuals.forEach(function(pair) {
                if (pair[1] > maxTemp){
                    maxTemp = pair[1];
                }
            });
            targets.forEach(function(pair) {
                if (pair[1] > maxTemp){
                    maxTemp = pair[1];
                }
            });
            return maxTemp;
        }

        self.setTarget = function(item) {
            var value = item.newTarget();
            if (!value) return;

            var onSuccess = function() {
                item.newTarget("");
            };

            if (item.key() == "bed") {
                self._setBedTemperature(value)
                    .done(onSuccess);
            } else {
                self._setToolTemperature(item.key(), value)
                    .done(onSuccess);
            }
        };

        self.setTargetFromProfile = function(item, profile) {
            if (!profile) return;

            
            var onSuccess = function() {
                item.newTarget("");
            };

            if (item.key() == "bed") {
                self._setBedTemperature(profile.bed)
                    .done(onSuccess);
            } else {
                // Assume set works and update target temperature right away. Essential for filament swap.
                item.target(profile.extruder);

                self._setToolTemperature(item.key(), profile.extruder)
                    .done(onSuccess);
            }
        };

        self.setTargetToZero = function(item) {
            var onSuccess = function() {
                item.newTarget("");
            };

            if (item.key() == "bed") {
                self._setBedTemperature(0)
                    .done(onSuccess);
            } else {
                self._setToolTemperature(item.key(), 0)
                    .done(onSuccess);
            }
        };

        self.setOffset = function(item) {
            var value = item.newOffset();
            if (!value) return;

            var onSuccess = function() {
                item.newOffset("");
            };

            if (item.key() == "bed") {
                self._setBedOffset(value)
                    .done(onSuccess);
            } else {
                self._setToolOffset(item.key(), value)
                    .done(onSuccess);
            }
        };

        self._setToolTemperature = function(tool, temperature) {
            var data = {};
            data[tool] = parseInt(temperature);

            return OctoPrint.printer.setToolTargetTemperatures(data);
        };

        self._setToolOffset = function(tool, offset) {
            var data = {};
            data[tool] = parseInt(offset);
            return OctoPrint.printer.setToolTemperatureOffsets(data);
        };

        self._setBedTemperature = function(temperature) {
            return OctoPrint.printer.setBedTargetTemperature(parseInt(temperature));
        };

        self._setBedOffset = function(offset) {
            return OctoPrint.printer.setBedTemperatureOffset(parseInt(offset));
        };

        self.handleEnter = function(event, type, item) {
            if (event.keyCode == 13) {
                if (type == "target") {
                    self.setTarget(item);
                } else if (type == "offset") {
                    self.setOffset(item);
                }
            }
        };

        self.onAfterTabChange = function(current, previous) {
            if (current != "#temp") {
                return;
            }
        }

    }

    OCTOPRINT_VIEWMODELS.push([
        TemperatureViewModel,
        ["loginStateViewModel", "settingsViewModel"],
        "#temp"
    ]);
});
