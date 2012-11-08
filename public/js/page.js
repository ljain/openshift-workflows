/**
*
* Controlling the WebApp
* ~~ Here be Dragons ~~
*
*/

// Variable that controls whether connections are repainted or not
var repaint = false;

// The angular module for the page
var workflows = angular.module('workflows', ['ui', 'jqui']);

// The main angular controller for the page
var App = function ($scope, $http) {
    // Page related objects
    $scope.error = true;
    var Busy = {  // Show a spinner to indicate busy status
        spinner: undefined,

        start : function () {
            $('#spinner').html('&nbsp;&nbsp;');
            if (!this.spinner) {
                this.spinner = new Spinner({
                    lines: 9, length: 3, width: 3, radius: 4, corners: 1, rotate: 0,
                    color: '#fff', speed: 1.3, trail: 100, shadow: false, className: 'spinner',
                    zIndex: 2e9, top: '5px', left: 'auto'
                }).spin(document.getElementById('spinner'));
            } else {
                this.spinner.spin(document.getElementById('spinner'));
            }
        },

        stop : function () {
            this.spinner.stop();
            $('#spinner').html('<i class="icon-cloud"></i>');
        }
    };
    var proxify = function (options, successCallback, failureCallback) { // Make call to the openshift broker
        $http({ // Proxify!
            url: '/proxy',
            method: 'POST',
            dataType: 'json',
            data: { options: JSON.stringify(options) }
        }).success(successCallback).error(failureCallback);
    };

    // Variables related to the connection parameters
    $scope.host = 'https://openshift.redhat.com';
    $scope.username = '';
    $scope.password = '';
    $scope.authString = '';
    $scope.appName = '';
    $scope.namespace = '';
    $scope.connected = false;

    // Variables related to the cartridges
    $scope.cartridges = [];
    $scope.rules = {};

    // Generic call back to set error for all requests
    var errorCallback = function (data, status, headers, config) {
       Busy.stop();
       $scope.error = true;
       console.log(JSON.parse(data.error));
       switch (status) {
          case 401:
             setError('Incorrect <strong>username</strong> or <strong>password</strong> entered');
          break;
          case 403:
             setError('The Openshift server is refusing to respond');
          break;
          case 422:
               setError('The request made to the OpenShift Server is semantically incorrect');
          break;
          case 500:
             setError('The server is broken! Retry in a while');
          break;
          default:
             setError('Error in contacting server!');
          break;
       }
    };

    // Functions dealing with the connection parameters
    $scope.submit = function () { // Authenticate user and get the list of cartridges
        Busy.start();
        $scope.cleargraph();
        $scope.connected = false;
        $scope.error = false;
        $('#connectionModal').modal('hide');
        $('#connection').css('color', '#d00');
        $scope.cartridges = [];
        proxify({ // Authenticate user
            uri: $scope.host + '/broker/rest/user',
            headers: {
                accept: 'application/json',
                Authorization: 'Basic ' + window.btoa($scope.username + ':' + $scope.password)
            },
            method: 'GET'
        }, function (data, status, headers, config) {
            $scope.authString = 'Basic ' + window.btoa($scope.username + ':' + $scope.password);
            proxify({ // Get list of cartridges
                uri: $scope.host + '/broker/rest/cartridges',
                headers: {
                    accept: 'application/json'
                },
                method: 'GET'
            }, function (data, status, headers, cfg1) {
                $http({ // Read configuration file for dependencies
                    url: '/config/rules.json',
                    method: 'GET'
                }).success(function (config, st, h, cfg2) {
                    $scope.rules = config;
                }).error(function (config, st, h, cfg2) {
                    setError('Could not get cartridge dependency rules.');
                });
                $http({ // Read configuration file for images
                    url: '/config/images.json',
                    method: 'GET'
                }).success(function (config, st, h, cfg2) {
                    data.data.forEach(function (ele, i, arr) {
                        ele.img = config[ele.display_name];
                        if (ele.img === undefined) {
                            ele.img = config['default'];
                        }
                    });
                }).error(function (config, st, h, cfg2) {
                    setError('Could not get cartridge image configuration');
                });
                $scope.cartridges = data.data;
                $('#connection').css('color', '#0d0');
                Busy.stop();
                $scope.connected = true;
            }, errorCallback);
        }, errorCallback);
    };

    // Variables and functions used in the Graph
    $scope.ctr = 0;
    $scope.graph = new Graph();
    $scope.graph.addVertex('node0');

    $scope.addnode = function (ident) { // Add a node to the Graph
        $scope.ctr = $scope.ctr + 1;
        $scope.graph.addVertexWithParent('node' + $scope.ctr, ident);




    };

    $scope.removenode = function (ident) { // Remove a node from the Graph
        $scope.graph.removeVertex(ident);
    };

    $scope.cleargraph = function () { // Delete the graph completely
        $scope.graph.vertices.forEach(function (e, i, arr) {
            $scope.graph.removeVertex(e.identifier);
        });
        $scope.ctr = 0;
        $scope.graph = new Graph();
        $scope.graph.addVertex('node0');
    };

    $scope.dragCartFromBar = function (item, list) { // Start the drag event for dragging object from cartridge list
        return {src: list, item: item};
    };

    $scope.acceptTokenInSubnode = function (targetArray, token) {       // Check if drag target is acceptable
          if (token) {
          var cartridge = token.item;
          if(targetArray.length === 0) {
             if (cartridge.type === 'standalone') {
                return true;
             } else {
                setError('First cartridge must be a standalone one.');
             }
          } else {
             if (cartridge.type != 'standalone') {
                if ($.inArray(cartridge, targetArray) < 0) {
                   var thisIsDB = false;
                   var dbAlreadyAdded = false;
                   for (var i in cartridge.tags) {
                      if (cartridge.tags[i] === 'database') {
                         thisIsDB = true;
                         break;
                      }
                   }
                   var flag = false;
                   for (var i in targetArray) {
                      for (var j in targetArray[i].tags) {
                         if (targetArray[i].tags[j] === 'database') {
                            dbAlreadyAdded = flag = true;
                            break;
                         }
                      }
                      if (flag) {
                         break;
                      }
                   }
                   if (!(thisIsDB && dbAlreadyAdded)) {
                      // Checking if there is a rule for this cartridge
                      flag = false;
                      for (var i in Object.keys($scope.rules)) {
                         if (cartridge.name === Object.keys($scope.rules)[i]) {
                            flag = true;
                            break;
                         }
                      }
                      if (!flag) {
                         return true;
                      }
                      // Checking if rules for this cartridge were satsfied
                      flag = false;
                      for (var i in Object.keys($scope.rules)) {
                         if (cartridge.name === Object.keys($scope.rules)[i]) {
                            for (var j in targetArray) {
                               if ($.inArray(targetArray[j].name, $scope.rules[Object.keys($scope.rules)[i]]) >= 0) {
                                  flag = true;
                                  break
                               }
                            }
                            if (flag) {
                               return true;
                            } else {
                               setError('Install ' + $scope.rules[Object.keys($scope.rules)[i]] + ' first.');
                            }
                         }
                     }
                   } else {
                      setError('Only one database cartridge is allowed.');
                   }
                } else {
                   setError('Duplicate cartridges cannot be added.');
                }
             } else {
                setError('Standalone cartridge already exists.');
             }
          }
       }
       return false;
    };

    $scope.commitTokenInSubnode = function (to, token) { // Add cartridge to vertex
        to.push(token.item);
        repaint  = true;
    };

    $scope.deleteCartridge = function (cartridge, vertex) { // Delete cartridge from vertex
        var i = -1;
        for (i in vertex.cartridges) {
            if(vertex.cartridges[i] === cartridge) {
                break;
            }
        }
        if (i>=0) {
            vertex.cartridges.splice(i);
        }
        repaint = true;
    };

    setInterval(function () { // Rpaint the edges so that changes in box size dont affect it
        if (repaint) {
            jsPlumb.repaintEverything();
        }
        repaint = false;
    }, 100);

    $scope.deploy = function () { // Deploy the graph to a openshift broker
        Busy.start();
        $scope.graph.vertices.forEach(function (ele, i, arr) {
            proxify({
                uri: $scope.host + '/broker/rest/domains/' + $scope.namespace + '/applications',
                headers: {
                    accept: 'application/json',
                    Authorization: 'Basic ' + window.btoa($scope.username + ':' + $scope.password)
                },
                method: 'POST',
                form: {
                    name: $scope.appName + i.toString(),
                    cartridge: ele.cartridges[0].name,
                    scale:'false'
                }
            }, function (data, status, headers, config) {
                if (ele.cartridges.length === 1) {
                   Busy.stop();
                }
                data = JSON.parse(data.error);
                ele.properties.app.git = data.data.git_url;
                ele.properties.app.app = data.data.app_url;
                ele.properties.app.ssh = data.data.ssh_url;
                for (var j=1; j<ele.cartridges.length; j++) {
                    proxify({
                        uri: $scope.host + '/broker/rest/domains/' + $scope.namespace + '/applications/' + $scope.appName + i.toString() + '/cartridges',
                        headers: {
                            accept: 'application/json',
                            Authorization: 'Basic ' + window.btoa($scope.username + ':' + $scope.password)
                        },
                        method: 'POST',
                        form: {
                            cartridge: ele.cartridges[j].name
                        }
                    }, function (data, status, headers, config) {
                        if (j==ele.cartridges.length-1) {
                            Busy.stop();
                        }
                        data = JSON.parse(data.error);
                        var cartData = {};
                        cartData.name = data.data.name;
                        for (var k in data.data.properties) {
                           var props = data.data.properties;
                           if (props[k].name === '' || props[k].value === '') {
                              continue;
                           }
                           cartData[props[k].name] = props[k].value;
                        }
                        ele.properties.cartridge.push(cartData);
                    }, errorCallback);
                }
                Busy.stop()
            }, errorCallback);
        });
    };
};
