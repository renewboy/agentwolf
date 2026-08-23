import { useGSAP } from '@gsap/react'
import { Flip } from 'gsap/Flip'
import { gsap } from 'gsap'

gsap.registerPlugin(useGSAP, Flip)

export { Flip, gsap, useGSAP }
