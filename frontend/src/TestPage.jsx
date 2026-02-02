import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:8000';
const MONO = "'Space Mono', 'Courier New', monospace";
const DIM = 'rgba(255, 255, 255, 0.5)';
const BORDER_DIM = '1px solid rgba(255, 255, 255, 0.3)';
const PASS_COLOR = '#4ade80';
const FAIL_COLOR = '#f87171';

const patternLines = {
  background: `repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.2),
    rgba(255, 255, 255, 0.2) 1px,
    transparent 1px,
    transparent 4px
  )`
};

const headerRuler = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '8px',
  background: `
    linear-gradient(90deg, #ffffff 1px, transparent 1px) 0 bottom / 20px 100%,
    linear-gradient(90deg, #ffffff 1px, transparent 1px) 0 bottom / 4px 40%
  `,
  backgroundRepeat: 'repeat-x'
};

const TestHeader = () => (
  <header style={{
    height: '48px', borderBottom: '1px solid #ffffff', display: 'flex',
    alignItems: 'center', padding: '0 16px', justifyContent: 'space-between',
    flexShrink: 0, position: 'relative',
  }}>
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
      <div style={{ ...patternLines, width: '24px', height: '24px', border: '1px solid #ffffff' }} />
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: MONO, fontWeight: 700 }}>
        Monte Carlo / Test Suite
      </span>
    </div>
    <a
      href="#/"
      style={{
        fontFamily: MONO, color: DIM, fontSize: '10px',
        textDecoration: 'none', border: BORDER_DIM, padding: '4px 10px',
        letterSpacing: '0.05em',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = DIM; }}
    >
      BACK TO SIMULATOR
    </a>
    <div style={headerRuler} />
  </header>
);

const SummaryBar = ({ data, loading, onRun }) => {
  const passed = data ? data.passed : 0;
  const total = data ? data.total : 0;
  const allPassed = data ? data.all_passed : false;

  return (
    <div style={{
      height: '52px', borderBottom: '1px solid #ffffff', display: 'flex',
      alignItems: 'center', padding: '0 16px', gap: '16px', flexShrink: 0,
    }}>
      <button
        onClick={onRun}
        disabled={loading}
        style={{
          fontFamily: MONO, fontSize: '11px', fontWeight: 700,
          background: loading ? 'rgba(255,255,255,0.1)' : '#ffffff',
          color: loading ? DIM : '#000000',
          border: '1px solid #ffffff', padding: '6px 16px',
          cursor: loading ? 'wait' : 'pointer', letterSpacing: '0.05em',
        }}
      >
        {loading ? 'RUNNING...' : 'RUN TESTS'}
      </button>

      {data && (
        <>
          <div style={{
            fontFamily: MONO, fontSize: '20px', fontWeight: 700,
            color: allPassed ? PASS_COLOR : FAIL_COLOR,
          }}>
            {passed}/{total}
          </div>
          <div style={{
            fontFamily: MONO, fontSize: '10px', color: allPassed ? PASS_COLOR : FAIL_COLOR,
            letterSpacing: '0.05em',
          }}>
            {allPassed ? 'ALL PASSED' : `${total - passed} FAILED`}
          </div>
        </>
      )}

      {!data && !loading && (
        <div style={{ fontFamily: MONO, fontSize: '11px', color: DIM }}>
          Click RUN TESTS to execute the test suite
        </div>
      )}
    </div>
  );
};

const CategoryBadge = ({ category }) => {
  const isStats = category === 'statistical';
  return (
    <span style={{
      fontFamily: MONO, fontSize: '8px', letterSpacing: '0.08em',
      textTransform: 'uppercase', padding: '2px 6px',
      border: BORDER_DIM,
      color: isStats ? 'rgba(110,158,255,0.8)' : DIM,
      background: isStats ? 'rgba(110,158,255,0.08)' : 'transparent',
    }}>
      {category}
    </span>
  );
};

const TestCard = ({ test, expanded, onToggle }) => {
  const color = test.passed ? PASS_COLOR : FAIL_COLOR;
  const bgHover = test.passed ? 'rgba(74,222,128,0.04)' : 'rgba(248,113,113,0.04)';

  return (
    <div
      style={{ borderBottom: BORDER_DIM, cursor: 'pointer' }}
      onClick={onToggle}
      onMouseEnter={(e) => { e.currentTarget.style.background = bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px',
      }}>
        {/* Status indicator */}
        <div style={{
          width: '44px', flexShrink: 0, textAlign: 'center',
          fontFamily: MONO, fontSize: '10px', fontWeight: 700,
          color: color, letterSpacing: '0.05em',
        }}>
          {test.passed ? 'PASS' : 'FAIL'}
        </div>

        {/* Vertical accent bar */}
        <div style={{
          width: '2px', height: '16px', background: color, flexShrink: 0,
          opacity: 0.6,
        }} />

        {/* Test name */}
        <div style={{
          flex: 1, fontFamily: MONO, fontSize: '12px', letterSpacing: '0.02em',
        }}>
          {test.name}
        </div>

        {/* Category badge */}
        <CategoryBadge category={test.category} />

        {/* Expand indicator */}
        <span style={{
          fontFamily: MONO, fontSize: '10px', color: DIM,
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
          display: 'inline-block',
        }}>
          {'>'}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          padding: '0 16px 16px 72px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          {/* Description */}
          <div style={{
            fontFamily: MONO, fontSize: '11px', color: DIM, lineHeight: '1.6',
          }}>
            {test.description}
          </div>

          {/* Expected / Actual */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
          }}>
            <div>
              <div style={{
                fontFamily: MONO, fontSize: '9px', color: DIM,
                letterSpacing: '0.1em', marginBottom: '4px',
              }}>
                EXPECTED
              </div>
              <div style={{
                fontFamily: MONO, fontSize: '11px', color: '#ffffff',
                background: 'rgba(255,255,255,0.04)', padding: '8px 10px',
                border: BORDER_DIM, lineHeight: '1.5', wordBreak: 'break-word',
              }}>
                {test.expected}
              </div>
            </div>
            <div>
              <div style={{
                fontFamily: MONO, fontSize: '9px', color: DIM,
                letterSpacing: '0.1em', marginBottom: '4px',
              }}>
                ACTUAL
              </div>
              <div style={{
                fontFamily: MONO, fontSize: '11px', color: color,
                background: test.passed ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)',
                padding: '8px 10px',
                border: `1px solid ${test.passed ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
                lineHeight: '1.5', wordBreak: 'break-word',
              }}>
                {test.actual}
              </div>
            </div>
          </div>

          {/* Details */}
          {test.details && (
            <div style={{
              fontFamily: MONO, fontSize: '10px', color: DIM,
              fontStyle: 'italic',
            }}>
              {test.details}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ErrorBanner = ({ message }) => (
  <div style={{
    margin: '16px', padding: '12px 16px',
    border: `1px solid ${FAIL_COLOR}`, background: 'rgba(248,113,113,0.08)',
    fontFamily: MONO, fontSize: '11px', color: FAIL_COLOR,
  }}>
    ERROR: {message}
  </div>
);

const TestPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/api/tests/run`);
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const result = await response.json();
      setData(result);
      // Auto-expand first failing test if any
      const firstFail = result.tests.find((t) => !t.passed);
      if (firstFail) setExpandedId(firstFail.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
      html, body, #root {
        margin: 0; padding: 0; height: 100%; overflow: hidden;
        background: #000000; color: #ffffff;
        font-family: 'Space Mono', 'Courier New', monospace;
      }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  const tests = data ? data.tests : [];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
    }}>
      <TestHeader />
      <SummaryBar data={data} loading={loading} onRun={runTests} />

      {error && <ErrorBanner message={error} />}

      {/* Test list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {tests.map((test) => (
          <TestCard
            key={test.id}
            test={test}
            expanded={expandedId === test.id}
            onToggle={() => setExpandedId(expandedId === test.id ? null : test.id)}
          />
        ))}

        {/* Footer */}
        {tests.length > 0 && (
          <div style={{
            padding: '24px 16px', textAlign: 'center',
            fontFamily: MONO, fontSize: '9px', color: DIM,
            letterSpacing: '0.1em',
          }}>
            {tests.length} TESTS EXECUTED
          </div>
        )}
      </div>
    </div>
  );
};

export default TestPage;
