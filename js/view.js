/** @jsx React.DOM */
(function () {
    'use strict';

    var AnswerItemView = React.createClass({displayName: 'AnswerItemView',
        /*getInitialState: function () {

        },*/
        render: function () {
            return React.DOM.li(null, "hello");
        }
    });
}());
/** @jsx React.DOM */
(function (app) {
    'use strict';

    var AnswerListView = React.createClass({displayName: 'AnswerListView',
        getInitialState: function () {
            return {
                posts: {}
            };
        },
        componentDidMount: function () {
            this.props.data.fetch().done(_.bind(function () {
                this.setState({
                    posts: this.props.data
                });
            }, this));
        },
        render: function() {
            var post = 'loading';
            var entries = [];
            if (_.isEmpty(this.state.posts)) {
                post = 'loading';
                return React.DOM.li(null, "Loading");
            } else {
                entries = this.state.posts.map(function (model) {
                    return AnswerItemView( {href:model.attributes.link, text:model.attributes.owner.display_name} );
                });
            }

            return React.DOM.ul( {id:"post-list"}, entries);
        }
    });

    var AnswerItemView = React.createClass({displayName: 'AnswerItemView',
        render: function () {
            return React.DOM.li(null, React.DOM.a( {href:this.props.href}, this.props.text));
        }
    });

    React.renderComponent(AnswerListView( {data:new app.AnswerCollection()} ), document.getElementById('main-container'));
}(app));