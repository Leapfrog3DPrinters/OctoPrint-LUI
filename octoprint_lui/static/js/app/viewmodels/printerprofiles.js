$(function () {
    var cleanProfile = function () {
        return {
            id: "",
            name: "",
            model: "",
            color: "default",
            volume: {
                formFactor: "rectangular",
                width: 200,
                depth: 200,
                height: 200,
                origin: "lowerleft"
            },
            boundaries: { 
                minX: 0,
                maxX: 200,
                minY: 0,
                maxY: 200,
                minZ: 0,
                maxZ: 200
                  },
            heatedBed: true,
            axes: {
                x: {speed: 6000, inverted: false},
                y: {speed: 6000, inverted: false},
                z: {speed: 200, inverted: false},
                e: {speed: 300, inverted: false}
            },
            extruder: {
                count: 1,
                offsets: [
                    [0,0]
                ],
                nozzleDiameter: 0.4
            }
        }
    };


    function PrinterProfilesViewModel() {
        var self = this;

        self.requestInProgress = ko.observable(false);

        self.profiles = new ItemListHelper(
            "printerProfiles",
            {
                "name": function(a, b) {
                    // sorts ascending
                    if (a["name"].toLocaleLowerCase() < b["name"].toLocaleLowerCase()) return -1;
                    if (a["name"].toLocaleLowerCase() > b["name"].toLocaleLowerCase()) return 1;
                    return 0;
                }
            },
            {},
            "name",
            [],
            [],
            10
        );
        self.defaultProfile = ko.observable();
        self.currentProfile = ko.observable();

        self.currentProfileData = ko.observable(ko.mapping.fromJS(cleanProfile()));

        self.requestData = function () {
            OctoPrint.printerprofiles.list()
                .done(self.fromResponse);
        };

        self.fromResponse = function(data) {
            var items = [];
            var defaultProfile = undefined;
            var currentProfile = undefined;
            var currentProfileData = undefined;
            _.each(data.profiles, function(entry) {
                if (entry.default) {
                    defaultProfile = entry.id;
                }
                if (entry.current) {
                    currentProfile = entry.id;
                    currentProfileData = ko.mapping.fromJS(entry, self.currentProfileData);
                }
                entry["isdefault"] = ko.observable(entry.default);
                entry["iscurrent"] = ko.observable(entry.current);
                items.push(entry);
            });
            self.profiles.updateItems(items);
            self.defaultProfile(defaultProfile);
            self.currentProfile(currentProfile);
            self.currentProfileData(currentProfileData);
        };


        self.onStartup = self.requestData;
    }

    OCTOPRINT_VIEWMODELS.push([
        PrinterProfilesViewModel,
        [],
        []
    ]);
});
