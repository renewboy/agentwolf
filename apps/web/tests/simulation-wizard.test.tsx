import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCopy } from '@agentwolf/assets'
import type { SimulationApprovalResult, SimulationReviewResult } from '@agentwolf/contracts'

const apiMocks = vi.hoisted(() => ({
  reviewSimulation: vi.fn(),
  approveSimulation: vi.fn(),
}))
vi.mock('../src/api.js', () => ({ api: apiMocks }))

import { SimulationWizardDialog } from '../src/components/SimulationWizardDialog.js'
import { matchView } from './fixtures/match.js'

function review(overrides: Partial<SimulationReviewResult> = {}): SimulationReviewResult {
  return {
    simulationId: 'simulation-test',
    relativePath: '.agentwolf/simulations/inbox/test.sim.json',
    sourceStatus: 'ended',
    turns: 3,
    events: 10,
    deterministic: true,
    replayOk: true,
    orchestrationDeterministic: true,
    orchestrationOk: true,
    runnersAgree: true,
    canApprove: true,
    canAcceptCurrent: true,
    failures: [],
    warnings: [],
    secretWarnings: [],
    ...overrides,
  } as SimulationReviewResult
}

function approval(overrides: Partial<SimulationApprovalResult> = {}): SimulationApprovalResult {
  return {
    simulationId: 'simulation-test',
    relativePath: 'apps/server/tests/fixtures/simulations/test.sim.json',
    created: true,
    variants: ['recorded', 'parallel'],
    ...overrides,
  } as SimulationApprovalResult
}

beforeEach(() => {
  apiMocks.reviewSimulation.mockReset()
  apiMocks.approveSimulation.mockReset()
  apiMocks.reviewSimulation.mockResolvedValue(review())
  apiMocks.approveSimulation.mockResolvedValue(approval())
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0)
    return 1
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})

describe('SimulationWizardDialog', () => {
  it('renders nothing without a Match and closes from prepare', async () => {
    const close = vi.fn()
    const { rerender } = render(<SimulationWizardDialog match={null} onClose={close} />)
    expect(document.querySelector('.aw-simulation-wizard')).toBeNull()
    rerender(<SimulationWizardDialog match={matchView({ status: 'paused' })} onClose={close} />)
    expect(screen.getByText(new RegExp(matchView().boardName, 'u'))).toBeVisible()
    expect(document.querySelectorAll('.aw-simulation-wizard__progress li')).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: getCopy('common.cancel') }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('shows reviewing activity and recovers from Error/string review failures', async () => {
    let rejectReview!: (reason: unknown) => void
    apiMocks.reviewSimulation
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectReview = reject
        }),
      )
      .mockRejectedValueOnce('review string failed')
      .mockResolvedValueOnce(review())
    render(<SimulationWizardDialog match={matchView()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }))
    expect(screen.getByText(getCopy('simulationWizard.reviewingTitle'))).toBeVisible()
    expect(
      screen.getByRole('button', { name: getCopy('simulationWizard.processing') }),
    ).toBeDisabled()
    rejectReview(new Error('review failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent('review failed')
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('review string failed')
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    )
    expect(await screen.findByText(getCopy('simulationWizard.reviewTitle'))).toBeVisible()
  })

  it('approves a clean review, shows created/existing completion, and resets on Match change', async () => {
    apiMocks.approveSimulation
      .mockResolvedValueOnce(approval())
      .mockResolvedValueOnce(approval({ created: false, variants: [] }))
    const close = vi.fn()
    const { rerender } = render(<SimulationWizardDialog match={matchView()} onClose={close} />)
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    )
    const approveButton = await screen.findByRole('button', {
      name: getCopy('simulationWizard.approve'),
    })
    expect(approveButton).toBeEnabled()
    await userEvent.click(approveButton)
    expect(await screen.findByText(getCopy('simulationWizard.completeTitle'))).toBeVisible()
    expect(screen.getByText(getCopy('simulationWizard.completeCreated'))).toBeVisible()
    expect(screen.getByText(/2/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: getCopy('simulationWizard.done') }))
    expect(close).toHaveBeenCalledOnce()

    rerender(
      <SimulationWizardDialog
        match={matchView({ id: 'match-other-abcdef', boardName: 'Other Board' })}
        onClose={close}
      />,
    )
    expect(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    ).toBeVisible()
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    )
    await userEvent.click(
      await screen.findByRole('button', { name: getCopy('simulationWizard.approve') }),
    )
    expect(await screen.findByText(getCopy('simulationWizard.completeExists'))).toBeVisible()
  })

  it('requires warning acknowledgement and current-behavior acceptance', async () => {
    apiMocks.reviewSimulation
      .mockResolvedValueOnce(
        review({
          canApprove: false,
          warnings: ['review warning'],
          failures: ['replay failed'],
          replayOk: false,
          deterministic: false,
          orchestrationOk: false,
          orchestrationDeterministic: false,
        }),
      )
      .mockResolvedValueOnce(review({ secretWarnings: ['secret found'] }))
    render(<SimulationWizardDialog match={matchView()} onClose={vi.fn()} />)
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    )
    expect(await screen.findByText('review warning')).toBeVisible()
    expect(screen.getByText('replay failed')).toBeVisible()
    const approveButton = screen.getByRole('button', { name: getCopy('simulationWizard.approve') })
    expect(approveButton).toBeDisabled()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    await userEvent.click(checkboxes[0]!)
    expect(approveButton).toBeDisabled()
    await userEvent.click(checkboxes[1]!)
    expect(approveButton).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.reviewAgain') }),
    )
    expect(await screen.findByText('secret found')).toBeVisible()
    expect(screen.getByRole('button', { name: getCopy('simulationWizard.approve') })).toBeDisabled()
  })

  it('returns to review after Error/string approval failures and retries with selected flags', async () => {
    apiMocks.reviewSimulation.mockResolvedValue(
      review({ canApprove: false, canAcceptCurrent: true, warnings: ['warning'] }),
    )
    apiMocks.approveSimulation
      .mockRejectedValueOnce(new Error('approve failed'))
      .mockRejectedValueOnce('approve string failed')
      .mockResolvedValueOnce(approval())
    render(<SimulationWizardDialog match={matchView()} onClose={vi.fn()} />)
    await userEvent.click(
      screen.getByRole('button', { name: getCopy('simulationWizard.startReview') }),
    )
    const checkboxes = await screen.findAllByRole('checkbox')
    await userEvent.click(checkboxes[0]!)
    await userEvent.click(checkboxes[1]!)
    const approveButton = screen.getByRole('button', { name: getCopy('simulationWizard.approve') })
    await userEvent.click(approveButton)
    expect(await screen.findByRole('alert')).toHaveTextContent('approve failed')
    await userEvent.click(screen.getByRole('button', { name: getCopy('simulationWizard.approve') }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('approve string failed'),
    )
    await userEvent.click(screen.getByRole('button', { name: getCopy('simulationWizard.approve') }))
    expect(apiMocks.approveSimulation).toHaveBeenLastCalledWith('simulation-test', {
      acceptCurrent: true,
      acknowledgeWarnings: true,
    })
    expect(await screen.findByText(getCopy('simulationWizard.completeTitle'))).toBeVisible()
  })
})
