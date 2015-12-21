$(function() {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.deferred = undefined;
    self.template_flyout = undefined;
    
    self.showFlyout = function(flyout, topic) {
      self.deferred = $.Deferred();

      self.template_flyout = '#'+flyout+'_flyout';
      console.log(self.template_flyout);

      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.addClass('active');
      $overlay.addClass('active');

      return self.deferred;
    };
    
    self.closeFlyout = function() {
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.removeClass('active');
      $overlay.removeClass('active');
      
      self.deferred.reject();
    };
    
    self.closeFlyoutWithButton = function() {
      var $toggle_flyout = $(self.template_flyout),
          $overlay = $('.overlay');
      $toggle_flyout.removeClass('active');
      $overlay.removeClass('active');
      
      self.deferred.resolve();
    };
  }

  OCTOPRINT_VIEWMODELS.push([
    FlyoutViewModel,
    [],
    []
  ]);

});