$(function () {
    function ToolInfoViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settingsViewModel = parameters[1];

        self._createToolEntry = function () {
            var entry = {
                name: ko.observable(),
                key: ko.observable(),
                actual: ko.observable(0),
                target: ko.observable(0),
                offset: ko.observable(0),
                newTarget: ko.observable(),
                newOffset: ko.observable(),
                progress: ko.observable(0),
                status: ko.observable(),
                filament: {
                    materialProfileName: ko.observable(),
                    amount: ko.observable(),
                    isExtruding: ko.observable(false),
                    isRetracting: ko.observable(false),
                    hotEndType: ko.observable("lt")
                }
            }

            entry.displayStatus = ko.pureComputed({
                read: function () {
                    return self.getToolStatusString(entry.status());
                }
            });

            entry.cssClass = ko.pureComputed({
                read: function () {
                    return self.getToolCssClass(entry.status());
                }
            });

            entry.filament.amountMeter = ko.pureComputed({
                read: function () {
                    return Math.round(entry.filament.amount() / 1000);
                },
                write: function (value) {
                    entry.filament.amount(value * 1000);
                }
            });

            return entry;
        };

        self.tools = ko.observableArray([]);
        self.hasBed = ko.observable(true);

        self.bedTemp = self._createToolEntry();
        self.bedTemp["name"](gettext("Bed"));
        self.bedTemp["key"]("bed");

        self.heaterOptions = ko.observable({});
        self.totalProgress = ko.observable(undefined);

        self.toolsHeating = ko.observable(false);
        self.isHeating = ko.observable(false);
        self.isStabilizing = ko.observable(false);

        self._onToolsUpdated = [];

        self._initializeTools = function () {
            // Initialize the tools
            var heaterOptions = {};
            var tools = self.tools();

            // tools
            var numExtruders = self.settingsViewModel.printerProfiles.currentProfileData().extruder.count();
            if (numExtruders) {
                for (var extruder = 0; extruder < numExtruders; extruder++) {
                    var key = "tool" + extruder;

                    heaterOptions["tool" + extruder] = {name: "T" + extruder};

                    if (tools.length <= extruder || !tools[extruder]) {
                        tools[extruder] = self._createToolEntry();
                    }

                    tools[extruder]["name"](self.getToolName(key));
                    tools[extruder]["key"](key);
                }
            }

            // print bed
            if (self.settingsViewModel.printerProfiles.currentProfileData().heatedBed()) {
                self.hasBed(true);
                heaterOptions["bed"] = {name: gettext("Bed") };
            } else {
                self.hasBed(false);
            }

            // write back
            self.heaterOptions(heaterOptions);
            self.tools(tools);

            // execute callbacks
            _.forEach(self._onToolsUpdated, function (func) { func(); });
        }

        self.onToolsUpdated = function (callback)
        {
            // Add the callback to the list of callbacks to be executed after a tool update
            self._onToolsUpdated.push(callback);
        }

        self.settingsViewModel.printerProfiles.currentProfileData.subscribe(function (value) {
            self._initializeTools();

            value.extruder.count.subscribe(self._initializeTools);
            value.heatedBed.subscribe(self._initializeTools);
        });

        self.fromCurrentData = function(data) {
            self._processTemperatureUpdateData(data.serverTime, data.temps);
        };

        self._processTemperatureUpdateData = function (serverTime, data) {
            // Process temperature update fed from OctoPrint
            if (data.length == 0)
                return;

            var lastData = data[data.length - 1];
            var totalActual = 0;
            var totalTarget = 0;

            var tools = self.tools();
            for (var i = 0; i < tools.length; i++) {

                if (lastData.hasOwnProperty("tool" + i)) {
                    var actual = lastData["tool" + i].actual || 0;
                    var target = lastData["tool" + i].target || 0;

                    tools[i]["actual"](actual.toFixed());
                    tools[i]["target"](target.toFixed());

                    tools[i]["progress"](self.heatingProgress(actual, target));

                    if (target !== 0) {   
                        totalActual += actual;
                        totalTarget += target;
                    }
                }
            }

            self.toolsHeating(totalTarget > 0);

            if (lastData.hasOwnProperty("bed")) {

                if (lastData.bed.actual)
                    self.bedTemp["actual"](lastData.bed.actual.toFixed());
                else
                    self.bedTemp["actual"](0);

                if (lastData.bed.target)
                    self.bedTemp["target"](lastData.bed.target.toFixed());
                else
                    self.bedTemp["target"](0);

                self.bedTemp["progress"](self.heatingProgress(lastData.bed.actual, lastData.bed.target));

                if (lastData.bed.target !== 0) {
                    totalTarget += lastData.bed.actual;
                    totalActual += lastData.bed.target;
                }
            }

            self.totalProgress(self.heatingProgress(totalActual, totalTarget));
        };

        self._processHeatingStatus = function (tool_status) {
            // Process temperature update fed from LUI
            var tools = self.tools();
            var isHeating = false;
            var isStabilizing = false;
            for (var i = 0; i < tools.length; i++) {

                if (tool_status.hasOwnProperty("tool" + i)) {
                    tools[i]["status"](tool_status["tool" + i]);
                    isHeating = isHeating || tool_status["tool" + i] == "HEATING";
                    isStabilizing = isStabilizing || tool_status["tool" + i] == "STABILIZING";
                }
            }

            if (tool_status.hasOwnProperty("bed")) {
                self.bedTemp["status"](tool_status["bed"]);
                isHeating = isHeating || tool_status["bed"] == "HEATING";
                isStabilizing = isStabilizing || tool_status["bed"] == "STABILIZING";
            }

            self.isHeating(isHeating);
            self.isStabilizing(isStabilizing);
        };

        self.getToolByKey = function(key)
        {
            return self.tools().find(function (x) { return x.key() === key });
        }

        self.getToolByNumber = function (num) {
            return self.tools().find(function (x) { return x.key() === "tool" + num });
        }

        self.getToolName = function(key) {
            switch (key){
                case "tool1":
                    return gettext("Left");
                case "tool0":
                    return gettext("Right");
                case "bed":
                    return gettext("Bed");
                default:
                    return 0;
            };
        }

        self.getToolStatusString = function(status) {
            switch(status) {
                case "HEATING":
                    return gettext("Heating");
                case "STABILIZING":
                    return gettext("Stabilizing");
                case "COOLING":
                    return gettext("Cooling");
                case "IDLE":
                    return gettext("Idle");
                case "READY":
                    return gettext("Ready");
                default:
                    return "";
            }
        }


        self.getToolCssClass = function (status) {
            switch (status) {
                case "HEATING":
                    return "bg-orange";
                case "STABILIZING":
                    return "bg-orange";
                case "COOLING":
                    return "bg-yellow";
                case "IDLE":
                    return "bg-main";
                case "READY":
                    return "bg-green"
                default:
                    return "bg-main";
            }
        }

        self.heatingProgress = function (actual, target) {
            if (target <= 1) {
                target = 200;
            }
            var progress = ((actual / target) * 100).toFixed(2);
            var result = (progress <= 100) ? progress : 100;
            return result;
        }

        self.printingStatusString = ko.pureComputed(function () {
            if (!self.toolsHeating()) {
                if (self.isStabilizing()) return gettext('Stabilizing bed');
                else if (self.isHeating()) return gettext('Heating bed');
                else return gettext('Printing');
            }
            else if (self.isStabilizing())
                return gettext('Stabilizing');
            else if (self.isHeating())
                return gettext('Heating');
            else
                return gettext('Printing');
        });

        self.onAfterTabChange = function(current, previous) {
            if (current != "#temp") {
                return;
            }
        }

        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin != "lui") {
                return;
            }

            var messageType = data['type'];
            var messageData = data['data'];

            switch (messageType) {
                case "tool_status":
                    self._processHeatingStatus(messageData.tool_status);
                    break;
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push([
        ToolInfoViewModel,
        ["loginStateViewModel", "settingsViewModel"],
        ["#temp"]
    ]);
});
