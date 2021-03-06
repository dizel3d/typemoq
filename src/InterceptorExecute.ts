﻿import * as _ from "lodash";
import * as all from "./_all";
import { InterceptorContext, IInterceptStrategy, InterceptionAction } from "./InterceptorContext";
import { CurrentInterceptContext } from "./CurrentInterceptContext";
import * as strategy from "./InterceptorStrategies";

export class InterceptorExecute<T> implements all.ICallInterceptor {
    private _interceptorContext: InterceptorContext<T>;

    constructor(mock: all.IMock<T>) {
        this._interceptorContext = new InterceptorContext(mock);
    }

    get interceptorContext(): InterceptorContext<T> { return this._interceptorContext; }

    intercept(invocation: all.ICallContext) {
        let localCtx = new CurrentInterceptContext();

        _.some(this.interceptionStrategies(), (strategy: IInterceptStrategy<T>) => {
            if (InterceptionAction.Stop === strategy.handleIntercept(invocation, this.interceptorContext, localCtx)) {
                return true;
            }
        });
    }

    removeInvocation(invocation: all.ICallContext) {
        this._interceptorContext.removeInvocation(invocation);
    }

    addExpectedCall(call: all.IProxyCall<T>): void {
        this._interceptorContext.addExpectedCall(call);
    }

    verify(): void {
        let expectedCalls: Array<all.IProxyCall<T>> = this._interceptorContext.expectedCalls();

        let verifiableCalls: Array<all.IProxyCall<T>> = _.filter(expectedCalls, (c: all.IProxyCall<T>) => c.isVerifiable);      
        for (let v of verifiableCalls) 
            this.verifyCallCount(v, v.expectedCallCount);

        let orderedCalls: Array<all.IProxyCall<T>> = _.filter(expectedCalls, (c: all.IProxyCall<T>) => c.isInSequence); 
        this.verifyCallsOrder(orderedCalls);
    }

    verifyCallCount<T>(call: all.IProxyCall<T>, times: all.Times): void {
        let actualCalls: Array<all.ICallContext> = this._interceptorContext.actualInvocations();

        let callCount: number = _.filter(actualCalls, (c: all.ICallContext) => call.matches(c)).length;

        if (!times.verify(callCount))
            this.throwVerifyCallCountException(call.setupCall, times);
    }

    private throwVerifyCallCountException(call: all.ICallContext, times: all.Times) {
        let e = new all.MockException(all.MockExceptionReason.CallCountVerificationFailed, call, times.failMessage(call));
        throw e;
    }

    private verifyCallsOrder<T>(expectedCalls: Array<all.IProxyCall<T>>): void {
        let actualCalls: Array<all.ICallContext> = this._interceptorContext.actualInvocations();
        
        this.checkCallOrderExpectations(expectedCalls, actualCalls);
    }

    private checkCallOrderExpectations<T>(expectedCalls: Array<all.IProxyCall<T>>, actualCalls: Array<all.ICallContext>): void {
         let checkOrder = (expectedCallCountList: Array<number>): boolean => {
            let expectedCallCount = _.sum(expectedCallCountList);
            let aci = 0;
            for (let eci = 0; eci < expectedCallCountList.length; eci++) {
                let expectedCall = expectedCalls[eci];
                let expectedCallCount = expectedCallCountList[eci];
                for (let count = 1; count <= expectedCallCount; count++) {
                    let actualCall = actualCalls[aci++];
                    if (!expectedCall.matches(actualCall))
                        return false;
                }
            }
            return aci === expectedCallCount;
        }

        let eureka = false;
        let execute = (acc: Array<number>, i: number) => { 
            if (!eureka) {
                if (i === expectedCalls.length)
                    eureka = checkOrder(acc);
                else
                    for (let j = expectedCalls[i].expectedCallCount.min; j <= expectedCalls[i].expectedCallCount.max; j++) {
                        acc[i] = j;
                        execute(acc, i + 1);
                    }
            }
        }
        execute([], 0);
        
        if(!eureka)
            this.throwVerifyCallOrderException();
    }

    private throwVerifyCallOrderException() {
        let e = new all.MockException(all.MockExceptionReason.CallOrderVerificationFailed, null);
        throw e;
    }

    reset(): void {
        this._interceptorContext.reset();
    }

    private interceptionStrategies(): _.List<IInterceptStrategy<T>> {
        let strategies: _.List<IInterceptStrategy<T>> = [
            new strategy.AddActualInvocation(),
            new strategy.ExtractProxyCall(),
            new strategy.ExecuteCall(),
            new strategy.InvokeBase(),
            new strategy.HandleMockRecursion()
        ];
        return strategies;
    }

}