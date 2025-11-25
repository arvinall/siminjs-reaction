import { getScope ,createMemo ,createSignal ,batch ,untrack } from './index.js'

var states = { loading: 1 ,resolved: 2 ,rejected: 3 }

export function createAsync (fn ,value) {
  var
    scope ,promise ,setError ,setLoading

    ,state = ((value != undefined) && (value != null)) ? states.resolved : states.loading

    ,f = async () => fn(value)

    ,loading = createMemo(p => (
      !scope && (scope = getScope())

      ,promise && (state != states.loading) && (state = states.loading)

      ,(p = promise = f())

      ,Promise.resolve(p).then(
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

    ,[data ,setData] = createSignal(value)

    ,getData = v => {
      v = data()

      if (state != states.rejected) return v

      throw untrack(getData.error)
    }

  setLoading = scope.memo

  ;[getData.error ,setError] = createSignal()

  getData.loading = loading

  getData.latest = getData

  return getData
}
