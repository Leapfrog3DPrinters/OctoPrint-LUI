$(function() {
  function FlyoutViewModel(parameters) {
    var self = this;
    
    self.deferred = undefined;
    self.selectedFlyout = ko.observable(undefined);
    
    self.showFlyout = function(template) {
      self.deferred = $.Deferred();
      
      self.selectedFlyout(template);
      self.flyout.show();
      
      return self.deferred;
    }
    
    self.closeFlyout = function() {
      self.flyout.hide();
      self.deferred.reject();
    }
    
    self.closeFlyoutWithButton = function() {
      self.flyout.hide();
      self.deferred.resolve();
    }
  }
  
  OCTOPRINT_VIEWMODELS.push([
    FlyoutViewModel,
    [],
    "#flyout"
  ]);
});