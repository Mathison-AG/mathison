"use client";

import { Component } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  fallbackMessage?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[300px] items-center justify-center p-6">
          <div className="text-center space-y-3 max-w-sm">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <AlertCircle className="size-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">
                {this.props.fallbackTitle ?? "Something went wrong"}
              </p>
              <p className="text-sm text-muted-foreground">
                {this.props.fallbackMessage ??
                  "We ran into an unexpected problem. Please try again."}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => this.setState({ hasError: false })}
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
