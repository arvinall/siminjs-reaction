import { append ,clear ,remove } from './linked-list.js'

var
  scope
  
  ,isTracking = false
  ,isFlushing = false
  ,isBatching = false

  ,immediateQueue = []
  ,queue = []

  ,queues = [immediateQueue ,queue]
  ,queuesSize = queues.length

  ,states = { clean: Symbol('clean') ,dirty: Symbol('dirty') ,target: Symbol('target') }

export var getScope = () => scope

export function untrack (fn ,...args) {
  if (isTracking) {
    isTracking = false

    var v = fn.apply(undefined ,args)

    isTracking = true

    return v
  }
  
  return fn.apply(undefined ,args)
}

function schedule (subscribers) {
  if (!subscribers.hd) return

  var
    stack = []
    
    ,item = subscribers.hd
    ,value

  while (item) {
    value = item.v

    if (value.state != states.target) (
      (!isFlushing && (value.state == states.clean)) && stack.push(value)
      
      ,(value.state = states.target)
    )

    item = item.n
  }

  while (stack.length) {
    value = stack.pop()

    if (value.state == states.clean) (value.state = states.dirty)

    if ('immediate' in value) { immediateQueue.push(value) ;continue }
    else if ('effect' in value) { queue.push(value) ;continue }

    item = value.subs.hd

    while (item) {
      value = item.v

      if (value.state == states.clean) stack.push(value)

      item = item.n
    }
  }

  if (!isFlushing && !isBatching) flush()
}

export function batch (fn ,...args) {
  var batching ,v

  if (!isBatching) batching = isBatching = true

  v = fn.apply(undefined ,args)
    
  if (batching) (
    !isFlushing && flush()
    
    ,(isBatching = false)
  )

  return v
}

function resolveUpstreams (obsItem) {
  var
    stack = []

    ,obsValue

    ,currentScope ,tracking

  while (obsItem) {
    obsValue = obsItem.v

    if (obsValue.state != states.clean) stack.push(obsValue)

    obsItem = obsItem.n
  }

  while (stack.length) {
    obsValue = stack[stack.length - 1]

    if (obsValue.state == states.clean) { stack.pop() ;continue }

    if (obsValue.state == states.target) {
      stack.pop()

      if (obsValue.touched) delete obsValue.touched

      currentScope = scope
      tracking = isTracking

      scope = obsValue
      isTracking = true
      
      obsValue.memo(obsValue.fn)

      scope = currentScope
      isTracking = tracking
    }

    else {
      if (obsValue.touched) {
        stack.pop()

        delete obsValue.touched

        obsValue.state = states.clean
        
        continue
      }

      obsValue.touched = true

      obsItem = obsValue.obs.hd

      while (obsItem) {
        obsValue = obsItem.v

        if (obsValue.state != states.clean) stack.push(obsValue)

        obsItem = obsItem.n
      }
    }
  }
}

export var onCleanup = fn => (
  scope?.clups
    ? scope.clups.push(fn)
    : (scope.clups = [fn])

  ,fn
)

function dispose (scope) {
  var
    stack = [scope]
    
    ,length ,idx ,v

  while (length = stack.length) {
    scope = stack[(idx = length - 1)]

    if (scope.dpTchd) {
      stack.pop()

      delete scope.dpTchd

      if (idx) (scope.state != states.clean) && (scope.state = states.clean)
      else if (scope.hd) clear(scope)

      if (scope.obs.hd) clear(scope.obs)

      for (
        idx = scope.obsSubs.length - 1

        ;((v = scope.obsSubs[idx]) ,idx > -1)

        ;idx--
      ) remove(v.subs ,v)

      if (scope.obsSubs.length) scope.obsSubs = []

      length = scope.clups?.length

      if (length) {
        for (idx = 0 ;idx < length ;idx++) scope.clups[idx]()

        scope.clups = undefined
      }
    }
    else {
      scope.dpTchd = true

      v = scope.hd

      while (v) { stack.push(v) ;v = v.n }
    }
  }
}

function flush () {
  if (isFlushing) return

  var
    queueIdx = 0
    ,currentQueue

    ,effectIdx ,effect

    ,currentScope ,tracking
    
    ,batching = isBatching

  isFlushing = true

  if (!batching) isBatching = true

  for (;queueIdx < queuesSize ;queueIdx++) {
    currentQueue = queues[queueIdx].sort((a ,b) => a.lvl - b.lvl)

    for (effectIdx = 0 ;effectIdx < currentQueue.length ;effectIdx++) {
      effect = currentQueue[effectIdx]

      if (effect.state == states.dirty) effect.obs.hd && resolveUpstreams(effect.obs.hd)

      if (effect.state == states.target) {
        dispose(effect)

        currentScope = scope
        tracking = isTracking

        scope = effect
        isTracking = true

        effect.value = effect.fn(effect.value)

        scope = currentScope
        isTracking = tracking
      }

      effect.state = states.clean
    }
  }

  queues[0] = immediateQueue = []
  queues[1] = queue = []

  if (!batching) isBatching = false

  isFlushing = false
}

export function createSignal (value ,config) {
  var
    subs = {} ,currentScope ,tracking ,idx ,v
    
    ,observer = isTracking && ('memo' in scope) && !('subs' in scope) && (
      (scope.subs = subs)

      ,scope
    )
    
    ,isEqual = config?.isEqual ?? Object.is
    
    ,get = () => (
      isTracking && (
        scope.obsSubs.push(
          append(subs, { v: scope ,subs })
        )

        ,observer && append(scope.obs, { v: observer })
      )

      ,observer && (
        (observer.state == states.dirty) && observer.obs.hd && resolveUpstreams(observer.obs.hd)

        ,(observer.state == states.target)
          ? (
            (currentScope = scope)
            ,(tracking = isTracking)
    
            ,(scope = observer)
            ,(isTracking = true)
    
            ,set(observer.fn)
    
            ,(scope = currentScope)
            ,(isTracking = tracking)
          )
          : (observer.state = states.clean)
      )

      ,value
    )
    
    ,set = val => {
      if (scope == observer) dispose(observer)

      if (typeof val == 'function') val = val(value)

      if (!isEqual || !isEqual(value ,val)) (
        (value = val)

        ,observer && ((observer.value = value) ,(observer.state = states.clean))

        ,schedule(subs)
      )

      else observer && (observer.state = states.clean)
      
      return value
    }

  return [ get, set ]
}

export function createImmediateEffect (fn ,value) {
  var
    effectScope = {
      parent: scope
      ,fn
      ,immediate: true
      ,state: states.target
      ,value
      ,lvl: scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1)
      ,obs: {}
      ,obsSubs: []
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  effectScope.value = fn(value)

  effectScope.state = states.clean

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
      ,state: states.target
      ,value
      ,lvl: scope?.lvl ?? 0
      ,obs: {}
      ,obsSubs: []
      // ,subs
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  scope = effectScope
  isTracking = true

  ;[get ,effectScope.memo] = createSignal(
    effectScope.value = fn(value)

    ,config
  )

  effectScope.state = states.clean

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
      ,state: states.target
      ,value
      ,lvl: scope?.tl?.lvl ?? ((scope?.lvl ?? -1) + 1)
      ,obs: {}
      ,obsSubs: []
    }

    ,tracking = isTracking

  if (scope) append(scope, effectScope)

  if (isBatching) { queue.push(effectScope) ;return }

  scope = effectScope
  isTracking = true

  effectScope.value = fn(value)

  effectScope.state = states.clean

  isTracking = tracking
  scope = effectScope.parent
}
