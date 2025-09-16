import {
    registerDecorator,
    ValidationOptions,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface
} from 'class-validator';
import { parseGitHubRepoUrl } from '../../utils/github.utils';

// Custom validation decorators for common business rules

/**
 * Validates that a string is a valid GitHub repository URL
 */
export function IsGitHubRepoUrl(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isGitHubRepoUrl',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    try {
                        const { owner, repo } = parseGitHubRepoUrl(value);
                        return !!(owner && repo);
                    } catch {
                        return false;
                    }
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid GitHub repository URL`;
                },
            },
        });
    };
}

/**
 * Validates that a string is a valid username (alphanumeric, underscore, hyphen)
 */
export function IsValidUsername(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isValidUsername',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    // Username rules: 3-30 characters, alphanumeric, underscore, hyphen
                    // Cannot start or end with special characters
                    const usernameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9_-]*[a-zA-Z0-9])?$/;
                    return value.length >= 3 && value.length <= 30 && usernameRegex.test(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be 3-30 characters long and contain only letters, numbers, underscores, and hyphens`;
                },
            },
        });
    };
}

/**
 * Validates password strength
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isStrongPassword',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    // Password requirements:
                    // - At least 8 characters
                    // - At least one uppercase letter
                    // - At least one lowercase letter
                    // - At least one number
                    // - At least one special character
                    const minLength = 8;
                    const hasUpperCase = /[A-Z]/.test(value);
                    const hasLowerCase = /[a-z]/.test(value);
                    const hasNumbers = /\d/.test(value);
                    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);

                    return value.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar;
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be at least 8 characters long and contain uppercase, lowercase, number, and special character`;
                },
            },
        });
    };
}

/**
 * Validates that a string is a valid API key format
 */
export function IsApiKeyFormat(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isApiKeyFormat',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    // API key format: gsk_[64 characters of base64url]
                    const apiKeyRegex = /^gsk_[A-Za-z0-9_-]{64}$/;
                    return apiKeyRegex.test(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid API key format`;
                },
            },
        });
    };
}

/**
 * Validates that a string is a valid hex color code
 */
export function IsHexColor(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isHexColor',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                    return hexColorRegex.test(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid hex color code (e.g., #FF0000 or #F00)`;
                },
            },
        });
    };
}

/**
 * Validates that an array has unique values
 */
export function IsUniqueArray(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isUniqueArray',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (!Array.isArray(value)) return false;

                    const uniqueValues = new Set(value);
                    return uniqueValues.size === value.length;
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must contain unique values`;
                },
            },
        });
    };
}

/**
 * Validates that a string is a valid slug (URL-friendly)
 */
export function IsSlug(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isSlug',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (typeof value !== 'string') return false;

                    // Slug rules: lowercase letters, numbers, hyphens only
                    // Cannot start or end with hyphen
                    const slugRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
                    return slugRegex.test(value);
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} must be a valid slug (lowercase letters, numbers, and hyphens only)`;
                },
            },
        });
    };
}

/**
 * Validates that a date is not in the future
 */
export function IsNotFutureDate(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isNotFutureDate',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    if (!(value instanceof Date) && typeof value !== 'string') return false;

                    const date = value instanceof Date ? value : new Date(value);
                    return date <= new Date();
                },
                defaultMessage(args: ValidationArguments) {
                    return `${args.property} cannot be in the future`;
                },
            },
        });
    };
}

/**
 * Validates that a number is within a specific range
 */
export function IsInRange(min: number, max: number, validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isInRange',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [min, max],
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    const [min, max] = args.constraints;
                    return typeof value === 'number' && value >= min && value <= max;
                },
                defaultMessage(args: ValidationArguments) {
                    const [min, max] = args.constraints;
                    return `${args.property} must be between ${min} and ${max}`;
                },
            },
        });
    };
}

/**
 * Validates that a string matches one of the allowed values (case-insensitive)
 */
export function IsOneOfIgnoreCase(allowedValues: string[], validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isOneOfIgnoreCase',
            target: object.constructor,
            propertyName: propertyName,
            constraints: [allowedValues],
            options: validationOptions,
            validator: {
                validate(value: any, args: ValidationArguments) {
                    const [allowedValues] = args.constraints;
                    if (typeof value !== 'string') return false;

                    return allowedValues.some((allowed: string) =>
                        allowed.toLowerCase() === value.toLowerCase()
                    );
                },
                defaultMessage(args: ValidationArguments) {
                    const [allowedValues] = args.constraints;
                    return `${args.property} must be one of: ${allowedValues.join(', ')}`;
                },
            },
        });
    };
}

/**
 * Validates JSON string format
 */
@ValidatorConstraint({ name: 'isValidJson', async: false })
export class IsValidJsonConstraint implements ValidatorConstraintInterface {
    validate(value: any, args: ValidationArguments) {
        if (typeof value !== 'string') return false;

        try {
            JSON.parse(value);
            return true;
        } catch {
            return false;
        }
    }

    defaultMessage(args: ValidationArguments) {
        return `${args.property} must be valid JSON`;
    }
}

export function IsValidJson(validationOptions?: ValidationOptions) {
    return function (object: Object, propertyName: string) {
        registerDecorator({
            name: 'isValidJson',
            target: object.constructor,
            propertyName: propertyName,
            options: validationOptions,
            validator: IsValidJsonConstraint,
        });
    };
}