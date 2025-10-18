import { append, remove } from './linked-list.js'

var
  scope
  
  ,isTracking = false
  ,isFlushing = false
  ,isBatching = false

  ,batchQueue = []

  ,immediateQueue = []
  ,queue = []

  ,states = {
    clean: Symbol('clean')
    ,dirty: Symbol('dirty')
    ,target: Symbol('target')
  }

export var getScope = () => scope

export function untrack (fn, args) {
  if (isTracking) {
    isTracking = false

    var v = fn.apply(undefined, args)

    isTracking = true

    return v
  }
  
  return fn.apply(undefined, args)
}

export function createSignal (value ,config) {
  var
    subscribers = {}
    
    ,observer = isTracking && ('memo' in scope) && (
      (scope.subscribers = subscribers)

      ,scope
    )
    
    ,isEqual = config?.isEqual ?? Object.is
    
    ,get = () => (
      isTracking && (
        append(subscribers, { v: scope })

        ,observer && append(scope.observers, { v: observer })
      )

      ,value
    )
    
    ,set = v => (
      (typeof v == 'function') && (v = v(value))
      
      ,(!isEqual || !isEqual(value ,v)) && (value = v)

      ,value
    )

  return [ get, set ]
}

export function createImmediateEffect (fn ,value) {
  var
    effectScope = {
      parent: scope
      ,fn
      ,immediate: true
      ,state: states.clean
      ,value
      ,observers: {}
    }
    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  effectScope.value = fn(value)

  isTracking = tracking
  scope = effectScope.parent
}

export function createMemo (fn ,value ,config) {
  var
    get

    ,effectScope = {
      parent: scope
      ,fn
      ,memo: true // will replace with signal setter
      ,state: states.clean
      ,value
      ,observers: {}
      // ,subscribers
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  ;[get ,effectScope.memo] = createSignal(
    effectScope.value = fn(value)

    ,config
  )

  isTracking = tracking
  scope = effectScope.parent

  return get
}

export function createEffect (fn ,value) {
  var
    effectScope = {
      parent: scope
      ,fn
      ,effect: true
      ,state: states.clean
      ,value
      ,observers: {}
    }
    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  effectScope.value = fn(value)

  isTracking = tracking
  scope = effectScope.parent
}
