import React from 'react';
import cn from 'classnames';
import createUncontrolledWidget from 'uncontrollable';

import Widget from './Widget';
import WidgetPicker from './WidgetPicker';
import List from './List';
import Popup from './Popup';
import Select  from './Select';
import ComboboxInput from './ComboboxInput';
import compat from './util/compat';
import focusManager from './util/focusManager';
import listDataManager from './util/listDataManager';
import * as CustomPropTypes from './util/PropTypes';
import accessorManager from './util/accessorManager';
import scrollManager from './util/scrollManager';
import withRightToLeft from './util/withRightToLeft';
import { isShallowEqual, result }  from './util/_';
import * as Props from './util/Props';
import * as Filter from './util/Filter';
import { widgetEditable } from './util/interaction';
import { instanceId, notify, isFirstFocusedRender } from './util/widgetHelpers';

let propTypes = {
  ...Filter.propTypes,

  //-- controlled props -----------
  value: React.PropTypes.any,
  onChange: React.PropTypes.func,
  open: React.PropTypes.bool,
  onToggle: React.PropTypes.func,
  //------------------------------------

  itemComponent: CustomPropTypes.elementType,
  listComponent: CustomPropTypes.elementType,

  groupComponent: CustomPropTypes.elementType,
  groupBy: CustomPropTypes.accessor,

  data: React.PropTypes.array,
  valueField: React.PropTypes.string,
  textField: CustomPropTypes.accessor,
  name: React.PropTypes.string,

  onSelect: React.PropTypes.func,

  autoFocus: React.PropTypes.bool,
  disabled: CustomPropTypes.disabled.acceptsArray,
  readOnly: CustomPropTypes.disabled,

  suggest: Filter.propTypes.filter,

  busy: React.PropTypes.bool,

  delay: React.PropTypes.number,
  dropUp: React.PropTypes.bool,
  duration: React.PropTypes.number,

  placeholder: React.PropTypes.string,
  inputProps: React.PropTypes.object,
  listProps: React.PropTypes.object,
  messages: React.PropTypes.shape({
    open: CustomPropTypes.message,
    emptyList: CustomPropTypes.message,
    emptyFilter: CustomPropTypes.message
  })
};

@withRightToLeft
class Combobox extends React.Component {

  static propTypes = propTypes;

  static defaultProps = {
    data: [],
    value: '',
    open: false,
    suggest: false,
    filter: false,
    delay: 500,
    listComponent: List,

    messages: msgs(),
  };

  constructor(props, context) {
    super(props, context);

    this.inputId = instanceId(this, '_input')
    this.listId = instanceId(this, '_listbox')
    this.activeId = instanceId(this, '_listbox_active_option')

    this.list = listDataManager(this)
    this.accessors = accessorManager(this)
    this.handleScroll = scrollManager(this)
    this.focusManager = focusManager(this, {
      willHandle: this.handleFocusWillChange,
      didHandle: this.handleFocusChanged
    })

    this.state = {
      ...this.getStateFromProps(props),
      open: false,
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    let isSuggesting = this.refs.input && this.refs.input.isSuggesting()
      , stateChanged = !isShallowEqual(nextState, this.state)
      , valueChanged = !isShallowEqual(nextProps, this.props)

    return isSuggesting || stateChanged || valueChanged
  }

  componentWillReceiveProps(nextProps) {
    this.setState(this.getStateFromProps(nextProps))
  }

  getStateFromProps(props) {
    let { accessors, list } = this
    let { value, data, filter } = props;

    let index = accessors.indexOf(data, value);
    let dataItem = index === -1 ? value : data[index]
    let itemText = accessors.text(dataItem);

    let searchTerm
    // filter only when the value is not an item in the data list
    if (index === -1 || (this.refs.input && this.refs.input.isSuggesting())) {
      searchTerm = itemText
    }

    data = Filter.filter(data, { searchTerm, ...props })

    let focusedIndex = index
    // index may have changed after filtering
    if (index !== -1) {
      index = accessors.indexOf(data, value)
      focusedIndex = index;
    }
    else {
      // value isn't a dataItem so find the close match
      focusedIndex = Filter.indexOf(data, {
        searchTerm,
        textField: accessors.text,
        filter: filter || true
      })
    }

    list.setData(data);

    return {
      data,
      selectedItem: list.nextEnabled(data[index]),
      focusedItem: list.nextEnabled(
        ~focusedIndex ? data[focusedIndex] : data[0])
    }
  }

  handleFocusWillChange = (focused) => {
    if (!focused && this.refs.input)
      this.refs.input.accept()
  };

  handleFocusChanged = (focused) => {
    if (!focused) this.close()
  };

  @widgetEditable
  handleSelect = (data, originalEvent) => {
    this.close()
    notify(this.props.onSelect, [data, { originalEvent }])
    this.change(data, false, originalEvent)
    this.focus();
  };

  handleInputKeyDown = ({ key }) => {
    this._deleting = key === 'Backspace' || key === 'Delete'
    this._isTyping = true
  };

  handleInputChange = (event) => {
    let suggestion = this.suggest(event.target.value);

    this.change(suggestion, true, event)
    this.open()
  };

  @widgetEditable
  handleKeyDown = (e) => {
    let self = this
      , key  = e.key
      , alt  = e.altKey
      , list = this.list
      , focusedItem = this.state.focusedItem
      , selectedItem = this.state.selectedItem
      , isOpen = this.props.open;

    notify(this.props.onKeyDown, [e])

    if (e.defaultPrevented)
      return

    if (key === 'End') {
      e.preventDefault()
      if (isOpen) this.setState({ focusedItem: list.last() })
      else          select(list.last(), true)
    }
    else if (key === 'Home') {
      e.preventDefault()
      if (isOpen) this.setState({ focusedItem: list.first() })
      else        select(list.first(), true)
    }
    else if (key === 'Escape' && isOpen)
      this.close()

    else if (key === 'Enter' && isOpen) {
      e.preventDefault();
      select(this.state.focusedItem, true)
    }
    else if (key === 'Tab') {
      this.refs.input.accept();
    }
    else if (key === 'ArrowDown') {
      e.preventDefault()
      if (alt)
        this.open()
      else {
        if (isOpen) this.setState({ focusedItem: list.next(focusedItem) })
        else        select(list.next(selectedItem), true)
      }
    }
    else if ( key === 'ArrowUp' ) {
      e.preventDefault()
      if ( alt )
        this.close()
      else {
        if (isOpen) this.setState({ focusedItem: list.prev(focusedItem) })
        else        select(list.prev(selectedItem), true)
      }
    }

    function select(item, fromList) {
      if (!item)
        return self.change(compat.findDOMNode(self.refs.input).value, false)

      self.refs.input.accept();

      if (fromList)
        return self.handleSelect(item, e)

      self.change(item, false, e)
    }
  };

  renderInput() {
    let {
        suggest
      , filter
      , busy
      , name
      , data
      , value
      , autoFocus
      , tabIndex
      , placeholder
      , inputProps
      , disabled, readOnly
      , open } = this.props;

    let valueItem = this.accessors.findOrSelf(data, value)

    let completeType = suggest
        ? filter ? 'both' : 'inline'
        : filter ? 'list' : '';

    return (
      <ComboboxInput
        {...inputProps}
        ref='input'
        role='combobox'
        name={name}
        id={this.inputId}
        autoFocus={autoFocus}
        tabIndex={tabIndex}
        suggest={suggest}
        disabled={disabled === true}
        readOnly={readOnly === true}
        aria-busy={!!busy}
        aria-owns={this.listId}
        aria-autocomplete={completeType}
        aria-activedescendant={open ? this.activeId : null}
        aria-expanded={open}
        aria-haspopup={true}
        placeholder={placeholder}
        value={this.accessors.text(valueItem)}
        onChange={this.handleInputChange}
        onKeyDown={this.handleInputKeyDown}
      />
    )
  }

  renderList(messages) {
    let { activeId, inputId, listId, accessors } = this;

    let { open, data } = this.props;
    let { selectedItem, focusedItem } = this.state;

    let List = this.props.listComponent
    let props = this.list.defaultProps();

    return (
      <List ref="list"
        {...props}
        id={listId}
        activeId={activeId}
        valueAccessor={accessors.value}
        textAccessor={accessors.text}
        selectedItem={selectedItem}
        focusedItem={open ? focusedItem : null}
        aria-hidden={!open}
        aria-labelledby={inputId}
        aria-live={open && 'polite'}
        onSelect={this.handleSelect}
        onMove={this.handleScroll}
        messages={{
          emptyList: data.length
            ? messages.emptyFilter
            : messages.emptyList
        }}
      />
    )
  }

  render() {
    let {
        className
      , duration
      , messages
      , busy
      , dropUp
      , open
      , listComponent: List } = this.props;

    let { focused } = this.state;

    let disabled = this.props.disabled === true
      , readOnly = this.props.readOnly === true

    let elementProps = Props.pickElementProps(this);
    let shouldRenderPopup = open || isFirstFocusedRender(this);

    messages = msgs(messages)

    return (
      <Widget
        {...elementProps}
        onBlur={this.focusManager.handleBlur}
        onFocus={this.focusManager.handleFocus}
        onKeyDown={this.handleKeyDown}
        className={cn(className, 'rw-combobox')}
      >
        <WidgetPicker
          open={open}
          dropUp={dropUp}
          focused={focused}
          disabled={disabled}
          readOnly={readOnly}
        >

          {this.renderInput()}

          <Select
            bordered
            busy={busy}
            icon='caret-down'
            onClick={this.toggle}
            disabled={disabled || readOnly}
            label={result(messages.open, this.props)}
          />
        </WidgetPicker>


        {shouldRenderPopup &&
          <Popup
            open={open}
            dropUp={dropUp}
            duration={duration}
            onOpening={() => this.refs.list.forceUpdate()}
          >
            <div>
              {this.renderList(List, messages)}
            </div>
          </Popup>
        }
      </Widget>
    )
  }

  focus() {
    this.refs.input &&
      this.refs.input.focus()
  }

  change(nextValue, typing, originalEvent) {
    const { onChange, value: lastValue } = this.props;
    this._typedChange = !!typing
    notify(onChange, [nextValue, {
      lastValue,
      originalEvent,
    }])
  }

  open() {
    if (!this.props.open)
      notify(this.props.onToggle, true)
  }

  close() {
    if (this.props.open)
      notify(this.props.onToggle, false)
  }

  @widgetEditable
  toggle = () => {
    this.focus()

    this.props.open
      ? this.close()
      : this.open()
  };

  suggest(searchTerm) {
    let { textField, suggest, minLength } = this.props
    let { data } = this.state;

    if (!this._deleting)
      return Filter.suggest(data, {
        minLength,
        textField,
        searchTerm,
        filter: suggest,
        caseSensitive: false
      })

    return searchTerm
  }
}

export default createUncontrolledWidget(
  Combobox, { open: 'onToggle', value: 'onChange' }, ['focus']);


function msgs(msgs){
  return {
    open: 'open combobox',
    emptyList:   'There are no items in this list',
    emptyFilter: 'The filter returned no results',
    ...msgs
  }
}
