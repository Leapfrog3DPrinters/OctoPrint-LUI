$(function () {

    OctoPrint = window.OctoPrint;

    //~~ Lodash setup

    _.mixin({"sprintf": sprintf, "vsprintf": vsprintf});

    //~~ Logging setup

    log.setLevel(DEBUG_LUI ? "debug" : "info");

    //~~ OctoPrint client setup
    OctoPrint.options.baseurl = BASEURL;
    OctoPrint.options.apikey = UI_API_KEY;

    OctoPrint.socket.onMessage("connected", function(data) {
        var payload = data.data;
        OctoPrint.options.apikey = payload.apikey;

        // update the API key directly in jquery's ajax options too,
        // to ensure the fileupload plugin and any plugins still using
        // $.ajax directly still work fine too
        UI_API_KEY = payload["apikey"];
        $.ajaxSetup({
            headers: {"X-Api-Key": UI_API_KEY}
        });
    });

    //~~ AJAX setup

    // work around a stupid iOS6 bug where ajax requests get cached and only work once, as described at
    // http://stackoverflow.com/questions/12506897/is-safari-on-ios-6-caching-ajax-results
    $.ajaxPrefilter(function(options, originalOptions, jqXHR) {
        if (options.type != "GET") {
            var headers;
            if (options.hasOwnProperty("headers")) {
                options.headers["Cache-Control"] = "no-cache";
            } else {
                options.headers = { "Cache-Control": "no-cache" };
            }
        }
    });

    // send the current UI API key with any request
    $.ajaxSetup({
        headers: {"X-Api-Key": UI_API_KEY}
    });

    //~~ Initialize file upload plugin

    $.widget("blueimp.fileupload", $.blueimp.fileupload, {
        options: {
            dropZone: null,
            pasteZone: null
        }
    });

    //~~ Initialize i18n

    var catalog = window["BABEL_TO_LOAD_" + LOCALE];
    if (catalog === undefined) {
        catalog = {messages: undefined, plural_expr: undefined, locale: undefined, domain: undefined}
    }
    babel.Translations.load(catalog).install();

    // Dummy translation requests for dynamic strings supplied by the backend
    var dummyTranslations = [
        // printer states
        gettext("Offline"),
        gettext("Opening serial port"),
        gettext("Detecting serial port"),
        gettext("Detecting baudrate"),
        gettext("Connecting"),
        gettext("Operational"),
        gettext("Printing from SD"),
        gettext("Sending file to SD"),
        gettext("Printing"),
        gettext("Paused"),
        gettext("Closed"),
        gettext("Transfering file to SD")
    ];

    //~ Initialise is touch device:
    function isTouchDevice() {
        return (('ontouchstart' in window) || window.DocumentTouch && document instanceof DocumentTouch);
    }

    //~ Set menu hover css rules for non touch devices
    if (!isTouchDevice()){
        var style_sheet = $('link[rel="stylesheet"]')[0].sheet
        addCSSRule(style_sheet, ".icon-bar a:hover", "color: #434A54; background-color: #FFFFFF;");
        addCSSRule(style_sheet, ".icon-bar a:hover i", "color: #434A54;");
    }


    //~~ Initialize view models

    // the view model map is our basic look up table for dependencies that may be injected into other view models
    var viewModelMap = {};

    // Fix Function#name on browsers that do not support it (IE):
    // see: http://stackoverflow.com/questions/6903762/function-name-not-supported-in-ie
    if (!(function f() {}).name) {
        Object.defineProperty(Function.prototype, 'name', {
            get: function () {
                return this.toString().match(/^\s*function\s*(\S*)\s*\(/)[1];
            }
        });
    }

    // helper to create a view model instance with injected constructor parameters from the view model map
    var _createViewModelInstance = function(viewModel, viewModelMap, optionalDependencyPass) {

        // mirror the requested dependencies with an array of the viewModels
        var viewModelParametersMap = function(parameter) {
            // check if parameter is found within optional array and if all conditions are met return null instead of undefined
            if (optionalDependencyPass && viewModel.optional.indexOf(parameter) !== -1 && !viewModelMap[parameter]) {
                log.debug("Resolving optional parameter", [parameter], "without viewmodel");
                return null; // null == "optional but not available"
            }

            return viewModelMap[parameter] || undefined; // undefined == "not available"
        };

        // try to resolve all of the view model's constructor parameters via our view model map
        var constructorParameters = _.map(viewModel.dependencies, viewModelParametersMap) || [];

        if (constructorParameters.indexOf(undefined) !== -1) {
            log.debug("Postponing", viewModel.name, "due to missing parameters:", _.keys(_.pick(_.zipObject(viewModel.dependencies, constructorParameters), _.isUndefined)));
            return;
        }

        // transform array into object if a plugin wants it as an object
        constructorParameters = (viewModel.returnObject) ? _.zipObject(viewModel.dependencies, constructorParameters) : constructorParameters;

        // if we came this far then we could resolve all constructor parameters, so let's construct that view model
        log.debug("Constructing", viewModel.name, "with parameters:", viewModel.dependencies);
        return new viewModel.construct(constructorParameters);
    };
    
    // map any additional view model bindings we might need to make
    var additionalBindings = {};
    _.forEach(OCTOPRINT_ADDITIONAL_BINDINGS, function(bindings) {
        var viewModelId = bindings[0];
        var viewModelBindTargets = bindings[1];
        if (!_.isArray(viewModelBindTargets)) {
            viewModelBindTargets = [viewModelBindTargets];
        }

        if (!additionalBindings.hasOwnProperty(viewModelId)) {
            additionalBindings[viewModelId] = viewModelBindTargets;
        } else {
            additionalBindings[viewModelId] = additionalBindings[viewModelId].concat(viewModelBindTargets);
        }
    });

    // helper for translating the name of a view model class into an identifier for the view model map
    var _getViewModelId = function(name){
        return name.substr(0, 1).toLowerCase() + name.substr(1); // FooBarViewModel => fooBarViewModel
    };

    // instantiation loop, will make multiple passes over the list of unprocessed view models until all
    // view models have been successfully instantiated with all of their dependencies or no changes can be made
    // any more which means not all view models can be instantiated due to missing dependencies
    var unprocessedViewModels = OCTOPRINT_VIEWMODELS.slice();
    unprocessedViewModels = unprocessedViewModels.concat(ADDITIONAL_VIEWMODELS);

    var allViewModels = [];
    var allViewModelData = [];
    var pass = 1;
    var optionalDependencyPass = false;
    var t0 = performance.now();
    log.info("Starting dependency resolution...");
    while (unprocessedViewModels.length > 0) {
        log.debug("Dependency resolution, pass #" + pass);
        var startLength = unprocessedViewModels.length;
        var postponed = [];

        // now try to instantiate every one of our as of yet unprocessed view model descriptors
        while (unprocessedViewModels.length > 0){
            var viewModel = unprocessedViewModels.shift();

            // wrap anything not object related into an object
            if(!_.isPlainObject(viewModel)) {
                viewModel = {
                    construct: (_.isArray(viewModel)) ? viewModel[0] : viewModel,
                    dependencies: viewModel[1] || [],
                    elements: viewModel[2] || [],
                    optional: viewModel[3] || []
                };
            }

            // make sure we have atleast a function
            if (!_.isFunction(viewModel.construct)) {
                log.error("No function to instantiate with", viewModel);
                continue;
            }

            // if name is not set, get name from constructor, if it's an anonymous function generate one
            viewModel.name = viewModel.name || _getViewModelId(viewModel.construct.name) || _.uniqueId("unnamedViewModel");

            // make sure all value's are in an array
            viewModel.dependencies = (_.isArray(viewModel.dependencies)) ? viewModel.dependencies : [viewModel.dependencies];
            viewModel.elements = (_.isArray(viewModel.elements)) ? viewModel.elements : [viewModel.elements];
            viewModel.optional = (_.isArray(viewModel.optional)) ? viewModel.optional : [viewModel.optional];

            // make sure that we don't have two view models going by the same name
            if (_.has(viewModelMap, viewModel.name)) {
                log.error("Duplicate name while instantiating " + viewModel.name);
                continue;
            }

            var viewModelInstance = _createViewModelInstance(viewModel, viewModelMap, optionalDependencyPass);

            // our view model couldn't yet be instantiated, so postpone it for a bit
            if (viewModelInstance === undefined) {
                postponed.push(viewModel);
                continue;
            }

            // we could resolve the depdendencies and the view model is not defined yet => add it, it's now fully processed
            var viewModelBindTargets = viewModel.elements;

            if (additionalBindings.hasOwnProperty(viewModel.name)) {
                viewModelBindTargets = viewModelBindTargets.concat(additionalBindings[viewModel.name]);
            }

            allViewModelData.push([viewModelInstance, viewModelBindTargets]);
            allViewModels.push(viewModelInstance);
            viewModelMap[viewModel.name] = viewModelInstance;
        }

        // anything that's now in the postponed list has to be readded to the unprocessedViewModels
        unprocessedViewModels = unprocessedViewModels.concat(postponed);

        // if we still have the same amount of items in our list of unprocessed view models it means that we
        // couldn't instantiate any more view models over a whole iteration, which in turn mean we can't resolve the
        // dependencies of remaining ones, so log that as an error and then quit the loop
        if (unprocessedViewModels.length === startLength) {
            // I'm gonna let you finish but we will do another pass with the optional dependencies flag enabled
            if (!optionalDependencyPass) {
                log.debug("Resolving next pass with optional dependencies flag enabled");
                optionalDependencyPass = true;
            } else {
                log.error("Could not instantiate the following view models due to unresolvable dependencies:");
                _.forEach(unprocessedViewModels, function(entry) {
                    log.error(entry.name + " (missing: " + _.filter(entry.dependencies, function(id) { return !_.has(viewModelMap, id); }).join(", ") + " )");
                });
                break;
            }
        }

        log.debug("Dependency resolution pass #" + pass + " finished, " + unprocessedViewModels.length + " view models left to process");
        pass++;
    }
    var t1 = performance.now();
    log.info("... dependency resolution done in " + (t1 - t0).toFixed() + " ms");

    //~~ Custom knockout.js bindings


    ko.bindingHandlers.allowBindings = {
        init: function (elem, valueAccessor) {
            return { controlsDescendantBindings: !valueAccessor() };
        }
    };
    ko.virtualElements.allowedBindings.allowBindings = true;

    ko.bindingHandlers.slimScrolledForeach = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            return ko.bindingHandlers.foreach.init(element, valueAccessor(), allBindings, viewModel, bindingContext);
        },
        update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            setTimeout(function () {
                if (element && element.nodeName == "#comment") {
                    // foreach is bound to a virtual element
                    $(element.parentElement).slimScroll({scrollBy: 0});
                } else {
                    $(element).slimScroll({scrollBy: 0});
                }
            }, 10);
            return ko.bindingHandlers.foreach.update(element, valueAccessor(), allBindings, viewModel, bindingContext);
        }
    };
    ko.virtualElements.allowedBindings.slimScrolledForeach = true;

    ko.bindingHandlers.invisible = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            if (!valueAccessor()) return;
            ko.bindingHandlers.style.update(element, function () {
                return { visibility: 'hidden' };
            });
        }
    };

    ko.bindingHandlers.touchClick = {
        init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            var self = this;
            if (isTouchDevice()) {
                var newValueAccessor = function () {
                    var result = {};
                    result['mousedown'] = valueAccessor();
                    return result;
                }
                ko.bindingHandlers.event.init.call(self, element, newValueAccessor, allBindings, viewModel, bindingContext)
                $(element).on('click', function(event){
                    event.preventDefault();
                })            
            } else {
                ko.bindingHandlers.click.init(element, valueAccessor, allBindings, viewModel, bindingContext);
            }
        }
    }

    ko.bindingHandlers.noUiSlider = {
        init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            var params = valueAccessor();

            element.isUpdatingBinding = false;
            
            var initValue = ko.unwrap(params.value());

            noUiSlider.create(element, {
                start: [ initValue ],
                step: 1,
                behaviour: 'tap',
                connect: 'lower',
                range: {
                    'min': 0,
                    'max': FILAMENT_ROLL_LENGTH
                },
                format: {
                    to: function (value) {
                        return value.toFixed(0);
                    },
                    from: function (value) {
                        return value;
                    }
                }
            });

            element.noUiSlider.on('slide', function (values, handle) {

                window.setTimeout(
                    function () {
                        element.isUpdatingBinding = true;
                        var value = values[handle];
                        params.value(value);
                        element.isUpdatingBinding = false;
                    }, 0);
            });
        },
        update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            if (element.isUpdatingBinding)
                return;

            var slider = element.noUiSlider;

            if (slider) {
                var params = ko.unwrap(valueAccessor());
                var newValue = ko.unwrap(params.value());
                slider.set(newValue);
            }
        }
    }

    // jquery plugin to select all text in an element
    // originally from: http://stackoverflow.com/a/987376
    $.fn.selectText = function () {
        var doc = document;
        var element = this[0];
        var range, selection;

        if (doc.body.createTextRange) {
            range = document.body.createTextRange();
            range.moveToElementText(element);
            range.select();
        } else if (window.getSelection) {
            selection = window.getSelection();
            range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    };

    $.fn.isChildOf = function (element) {
        return $(element).has(this).length > 0;
    };

    // Allow components to react to tab change
    var tabs = $('#tabs a[data-toggle="tab"]');
    tabs.on('show', function (e) {
        var current = e.target.hash;
        var previous = e.relatedTarget.hash;
        callViewModels(allViewModels, "onTabChange", [current, previous]);
    });

    tabs.on('shown', function (e) {
        var current = e.target.hash;
        var previous = e.relatedTarget.hash;
        callViewModels(allViewModels, "onAfterTabChange", [current, previous]);
    });


    //~~ view model binding

    var bindViewModels = function () {
        log.info("Going to bind " + allViewModelData.length + " view models...");
        var t0 = performance.now();

        _.forEach(allViewModelData, function(viewModelData) {
            if (!Array.isArray(viewModelData) || viewModelData.length != 2) {
                return;
            }

            var viewModel = viewModelData[0];
            var targets = viewModelData[1];

            if (targets === undefined) {
                return;
            }

            if (!_.isArray(targets)) {
                targets = [targets];
            }

            if (viewModel.hasOwnProperty("onBeforeBinding")) {
                viewModel.onBeforeBinding();
            }

            if (targets !== undefined) {
                if (!_.isArray(targets)) {
                    targets = [targets];
                }

                viewModel._bindings = [];

                _.forEach(targets, function(target) {
                    if (target === undefined) {
                        return;
                    }

                    var object;
                    if (!(target instanceof jQuery)) {
                        object = $(target);
                    } else {
                        object = target;
                    }

                    if (object === undefined || !object.length) {
                        log.info("Did not bind view model", viewModel.constructor.name, "to target", target, "since it does not exist");
                        return;
                    }

                    var element = object.get(0);
                    if (element === undefined) {
                        log.info("Did not bind view model", viewModel.constructor.name, "to target", target, "since it does not exist");
                        return;
                    }

                    try {
                        ko.applyBindings(viewModel, element);
                        viewModel._bindings.push(target);

                        if (viewModel.hasOwnProperty("onBoundTo")) {
                            viewModel.onBoundTo(target, element);
                        }

                        log.debug("View model", viewModel.constructor.name, "bound to", target);
                    } catch (exc) {
                        log.error("Could not bind view model", viewModel.constructor.name, "to target", target, ":", (exc.stack || exc));
                    }
                });
            }

            viewModel._unbound = viewModel._bindings !== undefined && viewModel._bindings.length === 0;

            if (viewModel.hasOwnProperty("onAfterBinding")) {
                viewModel.onAfterBinding();
            }
        });

        callViewModels(allViewModels, "onAllBound", [allViewModels]);
        var t1 = performance.now();
        log.info("... binding done in " + (t1 - t0).toFixed() + " ms.");

        callViewModels(allViewModels, "onStartupComplete");

        var loader = $('#loader-wrapper');
        loader.addClass('loaded');
        setTimeout(function(){
            loader.remove();
            sendToApi('printer/rgblights/default');
        }, 250)
    };

    if (!_.has(viewModelMap, "settingsViewModel")) {
        throw new Error("settingsViewModel is missing, can't run UI");
    }

    var t0 = performance.now();
    log.info("Initial application setup done, connecting to server...");
    var dataUpdater = new DataUpdater(allViewModels);
    dataUpdater.connect()
        .done(function () {
            var t1 = performance.now();
            log.info("Connected in " + (t1 - t0).toFixed() + " ms");
            log.info("Finalizing application startup");

            var startup = function() {
                //~~ Starting up the app
                callViewModels(allViewModels, "onStartup");
                bindViewModels();
            };

            OctoPrint.browser.passiveLogin()
                .always(function () {
                    // There appears to be an odd race condition either in JQuery's AJAX implementation or
                    // the browser's implementation of XHR, causing a second GET request from inside the
                    // completion handler of the very same request to never get its completion handler called
                    // if ETag headers are present on the response (the status code of the request does NOT
                    // seem to matter here, only that the ETag header is present).
                    //
                    // Minimal example with which I was able to reproduce this behaviour can be found
                    // at https://gist.github.com/foosel/b2ddb9ebd71b0b63a749444651bfce3f
                    //
                    // Decoupling all consecutive calls from this done event handler hence is an easy way
                    // to avoid this problem. A zero timeout should do the trick nicely.
                    window.setTimeout(startup, 0);
                });
        });


    // Icon bar selection
    $('.icon-bar a').on('mousedown', function () {
        //Remove open from open tab
        $('.tabs > .tab.open').removeClass('open');
        var tabID = $(this).attr('href');
        $('.icon-bar > a.active').removeClass('active');
        $(this).addClass('active');
        $(tabID).addClass('open');
    });

    // Open additional info print file
    $('li.file_name, li.file_info').on('click', function () {
        $(this).parent().siblings('.file_add_info').toggleClass('slide');
    });


    // Extruder toggle 
    $('.control-extrusion').on('click', '.not-active', function(){
        $(this).toggleClass('secondary-button active not-active');
        $(this).siblings().toggleClass('secondary-button active not-active');
    });

    // Don't drag links on touch screen
    $('a, div').on('dragstart', function(event) {event.preventDefault();});

    var flyout = viewModelMap["flyoutViewModel"];
    var $overlay = $('.overlay');
    $overlay.bind("click", function(e) {
        e.preventDefault();

        if (!offline_blocking &&
            !flyout.blocking &&
            flyout.warnings().length == 0 &&
            flyout.infos().length == 0 &&
            flyout.confirmationDeferred === undefined)
        {
            flyout.closeFlyout();
        }
    });

    // notifyjs init
    $.notify.addStyle("lui", {
        html:
            "<div>" +
                "<div class='image' data-notify-html='image'/>" +
                "<div class='text-wrapper'>" +
                    "<div class='notify-title' data-notify-html='title'/>" +
                    "<div class='notify-text' data-notify-html='text'/>" +
                "</div>" +
            "</div>",
        classes: {
            error: {
                "color": "#fafafa !important",
                "background-color": "#CC2B14",
                "border": "1px solid #FF0026"
            },
            success: {
                "background-color": "#A9CC3C",
                "border": "1px solid #4DB149"
            },
            info: {
                "color": "#fafafa !important",
                "background-color": "#4590cd",
                "border": "1px solid #1E90FF"
            },
            warning: {
                "background-color": "#EDDB53",
                "border": "1px solid #EEEE45"
            },
            black: {
                "color": "#fafafa !important",
                "background-color": "#333",
                "border": "1px solid #000"
            },
            white: {
                "background-color": "#f1f1f1",
                "border": "1px solid #ddd"
            }
        }
    });
    $.notify.defaults( 
        {
            arrowShow: false,
            autoHideDelay: 3000,
            globalPosition: "top left",
            style: "lui",
            className: "success",
            gap: 0
        }
    );

    // Global variable to defer print event notifications, e.g. during calibration
    deferEventNotifications = false;

    // dropit
    $('#files_menu').dropit();
    $('#timelapse_menu').dropit();
    $('#logs_menu').dropit();


    // jQuery overscroll

    if (REQUIRE_OVERSCROLL) {    
        $(".flyout-body").overscroll({
                direction: 'vertical',
                showThumbs: false
        });

        $("#tabs").overscroll({
                direction: 'vertical',
                showThumbs: false
        });
    }

    // JQuery Virtual Keyboard init

    var keyboardLayouts = {
        qwerty: {
            display: {
                'bksp'   :  "\u2190",
                'accept' : 'Accept',
                'default': 'ABC',
                'meta1'  : '.?123',
                'meta2'  : '#+=',
                'clear'  : 'Clear'
            },
            layout: 'custom',
            customLayout: {
                'default': [
                    'q w e r t y u i o p {bksp}',
                    'a s d f g h j k l {clear}',
                    '{s} z x c v b n m , . {s}',
                    '{meta1} {space} {meta1} {accept}'
                ],
                'shift': [
                    'Q W E R T Y U I O P {bksp}',
                    'A S D F G H J K L {clear}',
                    '{s} Z X C V B N M ! ? {s}',
                    '{meta1} {space} {meta1} {accept}'
                ],
                'meta1': [
                    '1 2 3 4 5 6 7 8 9 0 {bksp}',
                    '- / : ; ( ) \u20ac & @ {clear}',
                    '{meta2} . , ? ! \' " {meta2}',
                    '{default} {space} {default} {accept}'
                ],
                'meta2': [
                    '[ ] { } # % ^ * + = {bksp}',
                    '_ \\ | ~ < > $ \u00a3 \u00a5 {clear}',
                    '{meta1} . , ? ! \' " {meta1}',
                    '{default} {space} {default} {accept}'
                ]
            }
        },
        number: {
            layout: 'custom',
            customLayout: {
                normal: [
                    '7 8 9 {clear}',
                    '4 5 6 {cancel}',
                    '1 2 3 {accept}',
                    '. 0 {sp:3.1}',
                ]
            },
            usePreview: true,
            display: {
                'accept':'Accept:Accept',
                'clear':'Clear:Clear'
            }
        }
    };

    if (IS_LOCAL) {
        $("input[type='text'], input[type='password']").keyboard(keyboardLayouts.qwerty);

        $("input[type='number']").keyboard(keyboardLayouts.number);

        ko.bindingHandlers.keyboardForeach = {
            init: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                return ko.bindingHandlers.foreach.init(element, valueAccessor, allBindings, viewModel, bindingContext);
            },
            update: function (element, valueAccessor, allBindings, viewModel, bindingContext) {
                setTimeout(function ()  {
                    $(element.parentElement).find("input[type='number']").keyboard(keyboardLayouts.number);
                    $(element.parentElement).find("input[type='text']").keyboard(keyboardLayouts.qwerty);

                }, 10);
                return ko.bindingHandlers.foreach.update(element, valueAccessor, allBindings, viewModel, bindingContext);
            }
        };
        ko.virtualElements.allowedBindings.keyboardForeach = true;

    }
});
