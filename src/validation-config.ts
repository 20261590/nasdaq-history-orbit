import { z } from 'zod'

// Run before App's schema modules: even Zod's eval capability probe violates strict CSP.
z.config({ jitless: true })
