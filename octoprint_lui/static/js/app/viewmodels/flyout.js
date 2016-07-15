$(function() {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.deferred = undefined;
    self.confirmationDeferred = undefined;

    self.template_flyout = undefined;

    self.blocking = false;
    self.flyoutName = "";

    self.confirmation_title = ko.observable(undefined);
    self.confirmation_text = ko.observable(undefined);
    self.confirmation_question = ko.observable(undefined);
    
    self.warnings = ko.observableArray([]);
    self.infos = ko.observableArray([]);

    self.showWarning = function(title, message, blocking)
    {
        var blocking = blocking || false;
        warningVm = {
            warning_title: title,
            warning_text: message,
            blocking: blocking
        };

        self.warnings.push(warningVm);
        
        $overlay = $('.overlay');
        $overlay.addClass('active');

        return warningVm;
    }

    self.closeWarning = function(warningVm)
    {
        self.warnings.remove(warningVm);
        if (self.warnings().length == 0 && self.deferred === undefined)
        {
            $overlay.removeClass('active');
        }
    };

    self.closeLastWarning = function()
    {
        self.warnings.pop();
        
        if (self.warnings().length == 0 && self.deferred === undefined)
        {
            $overlay.removeClass('active');
        }
    }

    self.showInfo = function (title, message, blocking) {
        var blocking = blocking || false;
        infoVm = {
            info_title: title,
            info_text: message,
            blocking: blocking
        };

        self.infos.push(infoVm);

        $overlay = $('.overlay');
        $overlay.addClass('active');

        return infoVm;
    }

    self.closeInfo = function (infoVm) {
        self.infos.remove(infoVm);
        if (self.infos().length == 0 && self.deferred === undefined) {
            $overlay.removeClass('active');
        }
    };

    self.closeLastInfo = function () {
        self.infos.pop();

        if (self.infos().length == 0 && self.deferred === undefined) {
            $overlay.removeClass('active');
        }
    }

    self.showFlyout = function(flyout, blocking) {
      self.deferred = $.Deferred();
      self.blocking = blocking || false;
      
      self.flyoutName = flyout;

      self.template_flyout = '#'+flyout+'_flyout';
      self.toggleFlyout();

      // Call viewmodels with the flyout method on{FlyoutTopic}Shown
      var method = "on" + capitalize(flyout) + "FlyoutShown";
      callViewModels(self.allViewModels, method);

      return self.deferred;
    };
    
    self.showConfirmationFlyout = function(data, leaveFlyout) {
      // Set flyout ko.observables
      var title = data.title || "Are you sure?";
      var text = data.text || "";
      var question = data.question || "Are you sure want to proceed?";

      self.confirmation_title(title);
      self.confirmation_text(text);
      self.confirmation_question(question);

      // Show the confirmation flyout
      $('#confirmation_flyout').addClass('active');
      $('.overlay').addClass('active');

      self.confirmationDeferred = $.Deferred()
          .done(function () {
          $('#confirmation_flyout').removeClass('active');
            
          if (self.deferred !== undefined && !leaveFlyout)
              self.closeFlyoutAccept();
          else if (self.deferred === undefined)
              $('.overlay').removeClass('active');

          self.confirmationDeferred = undefined;
          })
          .fail(function () {
              $('#confirmation_flyout').removeClass('active');

              if (self.deferred === undefined)
                $('.overlay').removeClass('active');

              self.confirmationDeferred = undefined;
          });

      return self.confirmationDeferred;
    };

    self.closeFlyout = function() {
        self.toggleFlyout();
        if (self.deferred != undefined) {
            self.deferred.reject();
            self.deferred = undefined;
        }
    };
    
    self.closeFlyoutAccept = function() {
        self.toggleFlyout();
        if (self.deferred != undefined) {
            self.deferred.resolve();
            self.deferred = undefined;
        }
    };

    self.toggleFlyout = function() {
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.toggleClass('active');
      $overlay.toggleClass('active');
    };

    self.onAllBound = function(allViewModels) {
        self.allViewModels = allViewModels;
    };
  }

  OCTOPRINT_VIEWMODELS.push([
    FlyoutViewModel,
    [],
    ['#confirmation_flyout', '#warnings_container', '#infos_container'],
  ]);

});
