import {getScope ,createMemo ,createSignal ,batch ,untrack} from './index.js'

var states = {loading: 1 ,resolved: 2 ,rejected: 3}

export function createAsync (fn ,value ,config) {
  var
    scope ,promise ,setError ,setLoading

    ,state = ((value != undefined) && (value != null)) ? states.resolved : states.loading

    ,f = async () => fn(value)

    ,[refetchSignal ,setRefetchSignal] = createSignal(undefined ,{ isEqual: false })

    ,loading = createMemo(p => (
      !scope && (scope = getScope())

      ,refetchSignal()

      ,promise && (state != states.loading) && (state = states.loading)

      ,(p = promise = Promise.resolve(f())).then(
        v => (p == promise) && (
          (value = v)

          ,(state = states.resolved)

          ,batch(() => (setData(v) ,setError() ,setLoading(false)))
        )
        ,e => (p == promise) && (
          (state = states.rejected)

          ,batch(() => (setData() ,setError(e) ,setLoading(false)))
        )
      )

      ,(state == states.loading)
    ))

    ,[data ,setData] = createSignal(value ,config)

    ,getData = v => {
      v = data()

      if (state != states.rejected) return v

      throw untrack(getData.error)
    }

  setLoading = scope.memo

  ;[getData.error ,setError] = createSignal()

  getData.loading = loading

  getData.latest = data

  return [getData ,{
    mutate: v => (
      (state = states.resolved)

      ,batch(() => ((value = setData(v)) ,setError() ,setLoading(false)))
      
      ,value
    )

    ,refetch () { setRefetchSignal() }
  }]
}
