$(function () {
    function TerminalViewModel(parameters) {
        var self = this;

        self.loginState = parameters[0];
        self.settings = parameters[1];
        self.printerState = parameters[2];
        
        self.log = ko.observableArray([]);
        self.buffer = ko.observable(100);
        self.upperLimit = ko.observable(500);

        self.command = ko.observable(undefined);

        self.autoscrollEnabled = ko.observable(true);
        
        self.cmdHistory = [];
        self.cmdHistoryIdx = -1;

        self.lineCount = ko.computed(function () {
            var lines = self.log();
            var total = lines.length;

            if (total > self.upperLimit()) {
                return _.sprintf(gettext("showing %(displayed)d lines (buffer full)"), { displayed: total });
            } else {
                return _.sprintf(gettext("showing %(displayed)d lines"), { displayed: total });
            }
            
        });

        self.autoscrollEnabled.subscribe(function(newValue) {
            if (newValue) {
                self.log(self.log.slice(-self.buffer()));
            }
        });
        
        self.fromCurrentData = function(data) {
            self._processCurrentLogData(data.logs);
        };

        self._processCurrentLogData = function(data) {
            var length = self.log().length;
            if (length >= self.upperLimit()) {
                var cutoff = "--- too many lines to buffer, cut off ---";
                var last = self.log()[length-1];
                if (!last || last.type != "cut" || last.line != cutoff) {
                    self.log(self.log().concat(self._toInternalFormat(cutoff, "cut")));
                }
                return;
            }

            var newLog = self.log().concat(_.map(data, function(line) { return self._toInternalFormat(line) }));
            if (self.autoscrollEnabled()) {
                // we only keep the last <buffer> entries
                newLog = newLog.slice(-self.buffer());
            } else if (newLog.length > self.upperLimit()) {
                // we only keep the first <upperLimit> entries
                newLog = newLog.slice(0, self.upperLimit());
            }
            self.log(newLog);
            self.updateOutput();
        };

        self._processHistoryLogData = function(data) {
            self.log(_.map(data, function(line) { return self._toInternalFormat(line) }));
            self.updateOutput();
        };

        self._toInternalFormat = function(line, type) {
            if (type == undefined) {
                type = "line";
            }
            return {line: line, type: type}
        };

        self.updateOutput = function () {
            if (self.autoscrollEnabled()) {
                self.scrollToEnd();
            }
        };

        self.scrollToEnd = function () {

            var container = $("#terminal-output");
            if (container.length) {
                container.scrollTop(container[0].scrollHeight);
            }
        };

        self.toggleAutoscroll = function () {
            self.autoscrollEnabled(!self.autoscrollEnabled());
        };

        self.sendCommand = function () {
            var command = self.command();
            if (!command) {
                return;
            }

            var re = /^([gmt][0-9]+)(\s.*)?/;
            var commandMatch = command.match(re);
            if (commandMatch != null) {
                command = commandMatch[1].toUpperCase() + ((commandMatch[2] !== undefined) ? commandMatch[2] : "");
            }

            if (command) {
                OctoPrint.control.sendGcode(command)
                    .done(function () {
                        self.cmdHistory.push(command);
                        self.cmdHistory.slice(-300); // just to set a sane limit to how many manually entered commands will be saved...
                        self.cmdHistoryIdx = self.cmdHistory.length;
                        self.command("");
                    });
            }
        };

    }

    if (DEBUG_LUI) {
        OCTOPRINT_VIEWMODELS.push([
            TerminalViewModel,
            ["loginStateViewModel", "settingsViewModel", "printerStateViewModel"],
            "#term"
        ]);
    }
});
