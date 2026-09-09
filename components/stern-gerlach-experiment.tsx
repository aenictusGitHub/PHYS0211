'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SternGerlachLab } from '@/components/stern-gerlach-lab';
import { SternGerlachCascadeLab } from '@/components/stern-gerlach-cascade-lab';
import type { ExperimentCommand } from '@/components/lab-types';

export function SternGerlachExperiment({ active, command }: { active: boolean; command: ExperimentCommand | null }) {
  const [setup, setSetup] = useState<'single' | 'cascade'>('single');
  const sgCommand = command?.lab === 'stern-gerlach' ? command : null;
  useEffect(() => { if (sgCommand) setSetup(sgCommand.sgSetup ?? 'single'); }, [sgCommand]);
  return <>
    <div className="sg-setup-bar"><div className="mode-switch" role="group" aria-label="Montage de Stern–Gerlach">
      <Button variant="ghost" aria-pressed={setup === 'single'} className={setup === 'single' ? 'is-selected' : ''} onClick={() => setSetup('single')}>Un analyseur</Button>
      <Button variant="ghost" aria-pressed={setup === 'cascade'} className={setup === 'cascade' ? 'is-selected' : ''} onClick={() => setSetup('cascade')}>En cascade</Button>
    </div></div>
    <div hidden={setup !== 'single'}><SternGerlachLab active={active && setup === 'single'} command={sgCommand?.sgSetup !== 'cascade' ? sgCommand : null} /></div>
    <div hidden={setup !== 'cascade'}><SternGerlachCascadeLab active={active && setup === 'cascade'} command={sgCommand?.sgSetup === 'cascade' ? sgCommand : null} /></div>
  </>;
}
