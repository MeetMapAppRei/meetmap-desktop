import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useHasPosted(userId) {
  const id = userId || ''
  const [hasPosted, setHasPosted] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!id) {
      setHasPosted(true)
      setLoading(false)
      return () => {}
    }
    setLoading(true)
    supabase
      .from('events')
      .select('id')
      .eq('user_id', id)
      .limit(1)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) throw error
        setHasPosted((data || []).length > 0)
      })
      .catch(() => {
        if (!alive) return
        setHasPosted(true)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [id])

  return { hasPosted: !!hasPosted, loading: !!loading }
}

