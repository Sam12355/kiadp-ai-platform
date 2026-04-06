import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: 'var(--color-surface)' }}>
      <div className="text-center animate-fade-in">
        <h1 className="text-7xl font-extrabold mb-4"
            style={{ fontFamily: 'var(--font-heading)', color: 'var(--color-palm-500)' }}>
          404
        </h1>
        <p className="text-lg mb-6" style={{ color: 'var(--color-text-secondary)' }}>
          Page not found
        </p>
        <Link
          to="/"
          className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-200"
          style={{
            background: 'linear-gradient(135deg, var(--color-palm-700), var(--color-palm-500))',
          }}
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
