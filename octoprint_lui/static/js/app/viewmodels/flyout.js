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

    self.showWarning = function(title, message)
    {
        warningVm = {
            warning_title: title,
            warning_text: message
        };

        self.warnings.push(warningVm);
        
        $overlay = $('.overlay');
        $overlay.addClass('active');

        return warningVm;
    }

    self.closeWarning = function(warningVm)
    {
        self.warnings.remove(warningVm);
    };

    self.closeLastWarning = function()
    {
        self.warnings.pop();
        
        if (self.warnings().length == 0 && self.deferred === undefined)
        {
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
    
    self.showConfirmationFlyout = function(data) {
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
          .done(function ()
      {
          $('#confirmation_flyout').removeClass('active');

          if (self.deferred !== undefined)
              self.closeFlyoutAccept();
          else
              $('.overlay').removeClass('active');

          self.confirmationDeferred = undefined;
          console.log('confirmation confirmed');
          })
          .fail(function () {
              $('#confirmation_flyout').removeClass('active');

              if (self.deferred === undefined)
                $('.overlay').removeClass('active');

              self.confirmationDeferred = undefined;
              console.log('confirmation rejected');
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
    ['#confirmation_flyout', '#warnings_container'],
  ]);

});
