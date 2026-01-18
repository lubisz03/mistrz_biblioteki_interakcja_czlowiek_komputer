import { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './ui/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // W przyszłości można tutaj wysłać błąd do serwisu (np. Sentry)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Ups! Coś poszło nie tak</h1>
            <p className="text-gray-600 mb-6">
              Wystąpił nieoczekiwany błąd. Spróbuj odświeżyć stronę lub wróć do strony głównej.
            </p>
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 mb-2">Szczegóły błędu</summary>
                <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-4 justify-center">
              <Button variant="primary" onClick={this.handleReset} className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Wróć do strony głównej
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2"
              >
                Odśwież stronę
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
