import {
    PipeTransform,
    Injectable,
    ArgumentMetadata,
    Logger,
} from '@nestjs/common';
import { validate, ValidationError as ClassValidatorError } from 'class-validator';
import { plainToClass, Transform } from 'class-transformer';
import { ValidationError } from '../exceptions/app-error';

@Injectable()
export class EnhancedValidationPipe implements PipeTransform<any> {
    private readonly logger = new Logger(EnhancedValidationPipe.name);

    async transform(value: any, { metatype, type, data }: ArgumentMetadata) {
        // Skip validation for primitive types and if no metatype
        if (!metatype || !this.toValidate(metatype)) {
            return value;
        }

        // Transform plain object to class instance
        const object = plainToClass(metatype, value, {
            enableImplicitConversion: true,
        });

        // Validate the object
        const errors = await validate(object, {
            whitelist: true, // Strip properties that don't have decorators
            forbidNonWhitelisted: true, // Throw error for non-whitelisted properties
            transform: true, // Enable transformation
            validateCustomDecorators: true, // Validate custom decorators
            stopAtFirstError: false, // Collect all validation errors
        });

        if (errors.length > 0) {
            const validationDetails = this.buildValidationDetails(errors);

            this.logger.warn('Validation failed', {
                type,
                data,
                errors: validationDetails,
            });

            throw new ValidationError(
                'Validation failed',
                {
                    fields: validationDetails,
                    type: 'input_validation',
                }
            );
        }

        return object;
    }

    private toValidate(metatype: Function): boolean {
        const types: Function[] = [String, Boolean, Number, Array, Object];
        return !types.includes(metatype);
    }

    private buildValidationDetails(errors: ClassValidatorError[]): Record<string, any> {
        const details: Record<string, any> = {};

        for (const error of errors) {
            const field = error.property;
            const constraints = error.constraints || {};
            const children = error.children || [];

            details[field] = {
                value: error.value,
                constraints: Object.values(constraints),
                messages: Object.values(constraints),
            };

            // Handle nested validation errors
            if (children.length > 0) {
                details[field].children = this.buildValidationDetails(children);
            }
        }

        return details;
    }
}

/**
 * Specialized validation pipe for query parameters
 */
@Injectable()
export class QueryValidationPipe implements PipeTransform<any> {
    private readonly logger = new Logger(QueryValidationPipe.name);

    async transform(value: any, { metatype, type }: ArgumentMetadata) {
        if (type !== 'query' || !metatype || !this.toValidate(metatype)) {
            return value;
        }

        // Transform and validate query parameters
        const object = plainToClass(metatype, value, {
            enableImplicitConversion: true,
        });

        const errors = await validate(object, {
            whitelist: true,
            forbidNonWhitelisted: false, // More lenient for query params
            transform: true,
            validateCustomDecorators: true,
            stopAtFirstError: false,
        });

        if (errors.length > 0) {
            const validationDetails = this.buildValidationDetails(errors);

            this.logger.warn('Query validation failed', {
                query: value,
                errors: validationDetails,
            });

            throw new ValidationError(
                'Invalid query parameters',
                {
                    fields: validationDetails,
                    type: 'query_validation',
                }
            );
        }

        return object;
    }

    private toValidate(metatype: Function): boolean {
        const types: Function[] = [String, Boolean, Number, Array, Object];
        return !types.includes(metatype);
    }

    private buildValidationDetails(errors: ClassValidatorError[]): Record<string, any> {
        const details: Record<string, any> = {};

        for (const error of errors) {
            const field = error.property;
            const constraints = error.constraints || {};

            details[field] = {
                value: error.value,
                constraints: Object.values(constraints),
                messages: Object.values(constraints),
            };
        }

        return details;
    }
}

/**
 * Validation pipe for file uploads
 */
@Injectable()
export class FileValidationPipe implements PipeTransform<any> {
    private readonly logger = new Logger(FileValidationPipe.name);

    constructor(
        private readonly options: {
            maxSize?: number; // in bytes
            allowedMimeTypes?: string[];
            allowedExtensions?: string[];
        } = {}
    ) { }

    transform(file: any): any {
        if (!file) {
            throw new ValidationError('File is required');
        }

        // Validate file size
        if (this.options.maxSize && file.size > this.options.maxSize) {
            throw new ValidationError(
                `File size exceeds maximum allowed size of ${this.options.maxSize} bytes`,
                {
                    fileSize: file.size,
                    maxSize: this.options.maxSize,
                    type: 'file_size_validation',
                }
            );
        }

        // Validate MIME type
        if (this.options.allowedMimeTypes && !this.options.allowedMimeTypes.includes(file.mimetype)) {
            throw new ValidationError(
                'File type not allowed',
                {
                    mimeType: file.mimetype,
                    allowedMimeTypes: this.options.allowedMimeTypes,
                    type: 'file_type_validation',
                }
            );
        }

        // Validate file extension
        if (this.options.allowedExtensions) {
            const extension = file.originalname.split('.').pop()?.toLowerCase();
            if (!extension || !this.options.allowedExtensions.includes(extension)) {
                throw new ValidationError(
                    'File extension not allowed',
                    {
                        extension,
                        allowedExtensions: this.options.allowedExtensions,
                        type: 'file_extension_validation',
                    }
                );
            }
        }

        this.logger.debug('File validation passed', {
            filename: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
        });

        return file;
    }
}