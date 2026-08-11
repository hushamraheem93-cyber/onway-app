import React, { Component, ComponentType, PropsWithChildren } from "react";
import { ErrorFallback, ErrorFallbackProps } from "@/components/ErrorFallback";

export type ErrorBoundaryProps = PropsWithChildren<{
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, stackTrace: string) => void;
}>;

type ErrorBoundaryState = { error: Error | null };

/**
 * This is a special case for for using the class components. Error boundaries must be class components because React only provides error boundary functionality through lifecycle methods (componentDidCatch and getDerivedStateFromError) which are not available in functional components.
 * https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static defaultProps: {
    FallbackComponent: ComponentType<ErrorFallbackProps>;
  } = {
    FallbackComponent: ErrorFallback,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // H-32: this called onError and did nothing else, and App.tsx mounts the
    // boundary without one — so a crash caught here was recorded absolutely
    // nowhere. The project carries no error-tracking service, which makes the
    // device log the ONLY record that can exist; without this line a production
    // crash leaves no trace for anyone to find. Nothing is sent anywhere: this
    // stays on the device, like the console.error calls already used elsewhere
    // in the client.
    console.error("[crash]", error, info?.componentStack ?? "");
    try {
      if (typeof this.props.onError === "function") {
        this.props.onError(error, info?.componentStack);
      }
    } catch (handlerError) {
      // A reporting hook must never be able to break the boundary that is
      // already handling a crash — that would replace a recoverable screen with
      // a dead app.
      console.error("[crash] onError handler failed:", handlerError);
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { FallbackComponent } = this.props;

    return this.state.error && FallbackComponent ? (
      <FallbackComponent
        error={this.state.error}
        resetError={this.resetError}
      />
    ) : (
      this.props.children
    );
  }
}
